import { InstallationsPostgresDatasource } from "../../src/infrastructure/datasources/installations/installations.datasource.postgres";
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "../../src/generated/prisma/client";
import { PostgresDatabase } from "../../src/data/postgres";
import { UniqueConstraintError } from "../../src/domain/errors/unique-constraint.error";
import type { NewMobileOperation } from "../../src/domain/datasources/mobile/mobile-operation.datasource";
import { OperationalIncidentPostgresDatasource } from "../../src/infrastructure/datasources/incidents/operational-incident.datasource.postgres";
import { LocalProjectsPostgresDatasource } from "../../src/infrastructure/datasources/local-projects/local-projects.datasource.postgres";
import { MobileOperationPostgresDatasource } from "../../src/infrastructure/datasources/mobile/mobile-operation.datasource.postgres";
import { ModuloPostgresDatasource } from "../../src/infrastructure/datasources/parking/modulo.datasource.postgres";
import { SyncPostgresDatasource } from "../../src/infrastructure/datasources/sync/sync.datasource.postgres";
import { JobLockPostgresDatasource } from "../../src/infrastructure/datasources/system/job-lock.datasource.postgres";

let db: PrismaClient;
const suffix = Date.now().toString(36);
const tag = (value: string) => `t-${suffix}-${value}`;
const LINK_TOKEN = `viggo-test-${suffix}`;

const operations = new MobileOperationPostgresDatasource();
const incidents = new OperationalIncidentPostgresDatasource();
const sync = new SyncPostgresDatasource();
const modulos = new ModuloPostgresDatasource();
const locks = new JobLockPostgresDatasource();

let proyectoId = "";
let otherProyectoId = "";
let userId = "";
let superId = "";
let profileId = "";
const installationId = tag("inst");

const newOperation = (name: string, overrides: Partial<NewMobileOperation> = {}): NewMobileOperation => {
  const now = Date.now();
  return {
    operationId: randomUUID(),
    idempotencyKey: tag(`op-${name}`),
    type: "CREATE_TICKET",
    installationId,
    proyectoId,
    userId,
    payload: { moduleToken: "x" },
    status: "pending",
    attempts: 0,
    maxAttempts: 3,
    nextRetryAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
};

const cleanup = async () => {
  await db.jobLease.deleteMany({ where: { name: { startsWith: tag("") } } });
  await db.operationalIncident.deleteMany({ where: { incidentKey: { startsWith: tag("") } } });
  await db.mobileOperation.deleteMany({ where: { idempotencyKey: { startsWith: tag("") } } });
  await db.inboxEvent.deleteMany({ where: { eventId: { startsWith: tag("") } } });
  await db.localInstallation.deleteMany({ where: { installationId: { startsWith: tag("") } } });
  await db.pensionPass.deleteMany({ where: { idPass: { startsWith: tag("") } } });
  await db.pension.deleteMany({ where: { nombre: { startsWith: tag("") } } });
  await db.modulo.deleteMany({ where: { identificador: { startsWith: tag("") } } });
  await db.usuario.deleteMany({ where: { telefono: { startsWith: tag("") } } });
  await db.permissionProfile.deleteMany({ where: { nombre: { startsWith: tag("") } } });
  await db.proyecto.deleteMany({ where: { identificador: { startsWith: tag("") } } });
};

beforeAll(async () => {
  db = await PostgresDatabase.connect({ databaseUrl: process.env.DATABASE_URL!, poolMax: 8 });
  await cleanup();

  const proyecto = await db.proyecto.create({
    data: {
      nombre: "Plaza",
      coordinates: [-103.3, 20.6],
      ciudad: "GDL",
      identificador: tag("plaza"),
      installationLinkTokenHash: createHash("sha256").update(LINK_TOKEN).digest("hex"),
      installationLinkTokenEncrypted: "secret-ciphertext",
    },
  });
  proyectoId = proyecto.id;
  otherProyectoId = (await db.proyecto.create({ data: { nombre: "Otro", coordinates: [0, 0], ciudad: "GDL", identificador: tag("otro") } })).id;

  profileId = (await db.permissionProfile.create({ data: { app: "OPERATIVE_WEB", nombre: tag("caja"), modules: ["cashPayments"] } })).id;
  userId = (
    await db.usuario.create({
      data: {
        nombre: "Caja",
        apellido: "Uno",
        correo: `${tag("caja")}@example.com`,
        telefono: tag("caja"),
        password: "bcrypt-hash",
        allowedApps: ["OPERATIVE_WEB", "OPERATIVE_MOBILE"],
        parkings: { create: { proyectoId } },
        appPermissions: { create: { app: "OPERATIVE_WEB", permissionProfileId: profileId } },
        emailValidationTokenHash: "should-not-leak",
      },
    })
  ).id;
  superId = (
    await db.usuario.create({
      data: { nombre: "Super", apellido: "Admin", correo: `${tag("super")}@example.com`, telefono: tag("super"), password: "h", rol: "SUPER_ROLE" },
    })
  ).id;
  await db.localInstallation.create({ data: { installationId, proyectoId, status: "approved" } });
});

afterAll(async () => {
  await cleanup();
  await PostgresDatabase.disconnect();
});

describe("MobileOperationPostgresDatasource", () => {
  it("creates operations and keeps idempotency keys unique", async () => {
    const created = await operations.create(newOperation("a"));
    expect(created).toMatchObject({ status: "pending", attempts: 0, userId, proyectoId, error: "" });
    expect((await operations.findByIdempotencyKey(tag("op-a")))?.operationId).toBe(created.operationId);
    await expect(operations.create(newOperation("a"))).rejects.toBeInstanceOf(UniqueConstraintError);
    expect((await operations.createIfAbsent(newOperation("a"))).operationId).toBe(created.operationId);
    expect(await operations.findByOperationId(created.operationId, randomUUID())).toBeNull();
  });

  it("gives each command to only one poller", async () => {
    await db.mobileOperation.updateMany({ where: { installationId }, data: { status: "completed" } });
    for (const name of ["q1", "q2", "q3"]) await operations.create(newOperation(name));

    const claims = await Promise.all(Array.from({ length: 5 }, () => operations.claimNext(installationId, Date.now(), 60_000)));
    const claimed = claims.filter(Boolean);
    expect(claimed).toHaveLength(3);
    expect(new Set(claimed.map((operation) => operation!.operationId)).size).toBe(3);
    expect(claimed.every((operation) => operation!.status === "processing" && operation!.attempts === 1)).toBe(true);
    expect(await operations.claimNext(installationId, Date.now(), 60_000)).toBeNull();
  });

  it("completes with the ticket and supports ticket lookups", async () => {
    const [first] = (await operations.list({ installationId, status: "processing" }, { page: 1, limit: 10 })).operations;
    const completed = await operations.complete(first.operationId, installationId, {
      status: "completed",
      result: { ticket: { uid: "ticket-1", monto: 30 } },
      error: "",
      completedAt: Date.now(),
      updatedAt: Date.now(),
    });
    expect(completed?.result?.ticket.uid).toBe("ticket-1");
    expect((await operations.findForCompletion(first.operationId, installationId))?.status).toBe("completed");
    expect((await operations.findLatestCompletedWithTicket(userId))?.operationId).toBe(first.operationId);
    expect((await operations.findCompletedTicketSource(userId, "ticket-1"))?.operationId).toBe(first.operationId);
    expect((await operations.findLatestTicketSource(userId, "ticket-1"))?.operationId).toBe(first.operationId);
    expect(await operations.findCompletedWithTicket(userId, { from: Date.now() + 60_000 })).toEqual([]);
    expect(await operations.complete(first.operationId, installationId, { status: "failed", error: "x", updatedAt: Date.now() })).toBeNull();
  });

  it("retries, expires, dead-letters, recovers and reactivates like before", async () => {
    const now = Date.now();
    const [processing] = (await operations.list({ installationId, status: "processing" }, { page: 1, limit: 10 })).operations;
    const failed = await operations.complete(processing.operationId, installationId, {
      status: "failed",
      error: "boom",
      nextRetryAt: now + 30_000,
      updatedAt: now,
    });
    expect(failed).toMatchObject({ status: "failed", error: "boom", nextRetryAt: now + 30_000 });
    expect(failed?.result).toBeUndefined();

    const expiring = await operations.create(newOperation("exp", { expiresAt: now - 1 }));
    await operations.expireOverdue(installationId, now);
    expect((await operations.findByOperationId(expiring.operationId))?.status).toBe("expired");

    const exhausted = await operations.create(newOperation("exh", { attempts: 3, maxAttempts: 3 }));
    await operations.moveExhaustedToDeadLetter(installationId, now);
    expect((await operations.findByOperationId(exhausted.operationId))?.status).toBe("dead_letter");
    expect((await operations.findRecentDeadLetters(installationId, now - 1_000)).map((item) => item.operationId)).toContain(
      exhausted.operationId,
    );

    const stale = await operations.create(newOperation("stale"));
    await db.mobileOperation.update({
      where: { operationId: stale.operationId },
      data: { status: "processing", claimedAt: new Date(now - 120_000), attempts: 1 },
    });
    await operations.releaseStaleProcessing(installationId, now - 60_000, now);
    expect((await operations.findByOperationId(stale.operationId))?.status).toBe("pending");

    await db.mobileOperation.update({
      where: { operationId: stale.operationId },
      data: { status: "processing", processingDeadlineAt: new Date(now - 1) },
    });
    await operations.recoverStaleProcessing(now, now - 60_000);
    expect((await operations.findByOperationId(stale.operationId))?.error).toBe("Operacion recuperada al reiniciar Admin API");

    const reactivated = await operations.reactivate(exhausted.operationId, now);
    expect(reactivated).toMatchObject({ status: "pending", error: "" });
    expect(await operations.reactivate(exhausted.operationId, now)).toBeNull();
  });

  it("lists and counts with filters; unknown filters return nothing", async () => {
    const { total, operations: page } = await operations.list({ installationId }, { page: 1, limit: 2 });
    expect(page).toHaveLength(2);
    expect(total).toBeGreaterThan(2);
    expect(await operations.list({ status: "nope" }, { page: 1, limit: 10 })).toEqual({ total: 0, operations: [] });
    expect(await operations.countByStatus(["dead_letter"])).toBeGreaterThanOrEqual(0);
  });
});

describe("OperationalIncidentPostgresDatasource", () => {
  it("opens, refreshes and resolves incidents", async () => {
    const opened = await incidents.open(
      { incidentKey: tag("inc-1"), type: "INSTALLATION_OFFLINE", severity: "critical", source: "test", projectId: proyectoId, message: "offline", metadata: { a: 1 } },
      1_000,
    );
    expect(opened).toMatchObject({ status: "open", openedAt: 1_000, projectId: proyectoId, metadata: { a: 1 } });

    const refreshed = await incidents.open(
      { incidentKey: tag("inc-1"), type: "INSTALLATION_OFFLINE", severity: "warning", source: "test", projectId: proyectoId, message: "still offline" },
      2_000,
    );
    expect(refreshed).toMatchObject({ openedAt: 1_000, lastSeenAt: 2_000, severity: "warning", metadata: { a: 1 } });

    expect((await incidents.resolve(tag("inc-1"), 3_000))?.status).toBe("resolved");
    expect(await incidents.resolve(tag("inc-1"), 4_000)).toBeNull();

    const orphan = await incidents.open(
      { incidentKey: tag("inc-2"), type: "FINANCIAL_WORKER_FAILED", severity: "critical", source: "test", projectId: randomUUID(), message: "x" },
      5_000,
    );
    expect(orphan.projectId).toBe("");

    const { incidents: resolved } = await incidents.list({ status: "resolved", projectId: proyectoId }, { page: 1, limit: 10 });
    expect(resolved.map((item) => item.incidentKey)).toContain(tag("inc-1"));
    expect(await incidents.list({ type: "NOPE" }, { page: 1, limit: 10 })).toEqual({ total: 0, incidents: [] });
  });
});

describe("SyncPostgresDatasource", () => {
  let moduloId = "";

  beforeAll(async () => {
    moduloId = (
      await modulos.create({
        nombre: "Entrada",
        proyecto: proyectoId,
        tipo: "ENTRADA",
        estado: true,
        identificador: tag("entrada"),
        submodulos: [{ submoduloId: "QR-1", nombre: "Lector", tipo: "QR_SCANNER", estado: true }],
      } as unknown as Parameters<typeof modulos.create>[0])
    ).id;
    const pension = await db.pension.create({
      data: {
        proyectoId,
        nombre: tag("mensual"),
        precio: "100.00",
        horarios: { create: Array.from({ length: 7 }, (_, weekDay) => ({ weekDay, fromMinutes: 450, toMinutes: 1320 })) },
      },
    });
    await db.pensionPass.create({ data: { pensionId: pension.id, name: "P1", idPass: tag("pp1") } });
  });

  it("sends OPERATIVO the configuration with the same field names and no secrets", async () => {
    const configuration = (await sync.getConfiguration(proyectoId))!;
    expect(configuration.proyecto._id).toBe(proyectoId);
    expect(configuration.proyecto).not.toHaveProperty("installationLinkTokenHash");
    expect(configuration.proyecto).not.toHaveProperty("installationLinkTokenEncrypted");
    expect(configuration.modulos[0]).toMatchObject({ _id: moduloId, proyecto: proyectoId, coordinates: [] });
    expect(configuration.modulos[0].submodulos[0]).toMatchObject({ submoduloId: "QR-1" });
    expect(configuration.pensiones[0].validez[0]).toEqual({ weekDay: 0, from: [7, 30], to: [22, 0] });
    expect(configuration.pensionPasses[0]).toMatchObject({ from: -1, to: -1, usuario: undefined });

    expect((await sync.getConfiguration(proyectoId))!.version).toBe(configuration.version);
    await db.modulo.update({ where: { id: moduloId }, data: { nombre: "Entrada norte" } });
    expect((await sync.getConfiguration(proyectoId))!.version).not.toBe(configuration.version);

    // The parking's time zone travels with the project, and changing it is a new configuration.
    expect(configuration.proyecto.zonaHoraria).toBe("America/Mexico_City");
    const before = (await sync.getConfiguration(proyectoId))!.version;
    await db.proyecto.update({ where: { id: proyectoId }, data: { zonaHoraria: "America/Tijuana" } });
    const after = (await sync.getConfiguration(proyectoId))!;
    expect(after.proyecto.zonaHoraria).toBe("America/Tijuana");
    expect(after.version).not.toBe(before);
    await db.proyecto.update({ where: { id: proyectoId }, data: { zonaHoraria: "America/Mexico_City" } });
    expect(await sync.getConfiguration(randomUUID())).toBeNull();
  });

  it("sends the users of the parking plus super admins, with their profiles", async () => {
    const snapshot = (await sync.getAccessSnapshot(proyectoId))!;
    const ids = snapshot.users.map((user: { _id: string }) => user._id);
    expect(ids).toEqual(expect.arrayContaining([userId, superId]));
    const caja = snapshot.users.find((user: { _id: string }) => user._id === userId);
    expect(caja).toMatchObject({ password: "bcrypt-hash", parkings: [proyectoId] });
    expect(caja).not.toHaveProperty("emailValidationTokenHash");
    expect(snapshot.permissionProfiles.map((profile: { _id: string }) => profile._id)).toEqual([profileId]);
    expect(await sync.getAccessSnapshot(otherProyectoId)).toMatchObject({ users: expect.not.arrayContaining([expect.objectContaining({ _id: userId })]) });
  });

  it("resolves a user's access per app, only for the installation's project", async () => {
    const web = await sync.getAccessUserByCorreo(`${tag("caja")}@example.com`, "OPERATIVE_WEB", proyectoId);
    expect(web?.permissionProfile).toMatchObject({ _id: profileId, modules: ["cashPayments"] });
    expect(web?.user.appPermissions).toEqual([{ app: "OPERATIVE_WEB", permissionProfileId: profileId }]);

    const mobile = await sync.getAccessUserByTelefono(tag("caja"), "OPERATIVE_MOBILE", proyectoId);
    expect(mobile).toMatchObject({ permissionProfile: null, user: { appPermissions: [] } });
    expect(await sync.getAccessUserByCorreo(`${tag("caja")}@example.com`, "ADMIN_WEB", proyectoId)).toBeNull();

    // Another project's installation cannot look this user up.
    expect(await sync.getAccessUserByCorreo(`${tag("caja")}@example.com`, "OPERATIVE_WEB", otherProyectoId)).toBeNull();
    expect(await sync.getAccessUserByTelefono(tag("caja"), "OPERATIVE_MOBILE", otherProyectoId)).toBeNull();
  });

  it("links installations with the project token and issues them their own sync token", async () => {
    const base = {
      installationId: tag("inst-2"),
      proyectoId,
      localApiBaseUrl: "http://10.0.0.5:3002",
      serverIp: "10.0.0.5",
      serverMac: "AA",
      browserCoordinates: [-103.3, 20.6] as [number, number],
      requestedByUserId: "local-user",
      requestedByUserName: "Operador",
    };
    // The link token identifies the project; the installation never chooses it.
    expect(await sync.findProjectByLinkToken(LINK_TOKEN)).toMatchObject({ id: proyectoId, nombre: "Plaza" });
    expect(await sync.findProjectByLinkToken("wrong")).toBeNull();
    expect(await sync.findProjectByLinkToken("")).toBeNull();
    expect((await sync.requestInstallationLink({ ...base, proyectoId: randomUUID() })).status).toBe("missing-project");

    const first = await sync.requestInstallationLink(base);
    expect(first).toMatchObject({ status: "ok", request: { status: "pending", proyectoNombre: "Plaza", browserCoordinates: [-103.3, 20.6] } });
    const resent = await sync.requestInstallationLink({ ...base, serverIp: "10.0.0.6" });
    expect(resent.request).toMatchObject({ requestedAt: first.request!.requestedAt, serverIp: "10.0.0.6" });

    // Pending: no token yet; another project's link token does not see the request.
    expect(await sync.getInstallationRequestStatus(tag("inst-2"), proyectoId)).toMatchObject({ oneTimeSyncToken: null, request: { status: "pending" } });
    expect((await sync.getInstallationRequestStatus(tag("inst-2"), otherProyectoId)).request).toBeUndefined();

    await db.localInstallation.update({ where: { installationId: tag("inst-2") }, data: { status: "approved" } });
    const status = await sync.getInstallationRequestStatus(tag("inst-2"), proyectoId);
    expect(status.proyecto?._id).toBe(proyectoId);
    expect(status.proyecto).not.toHaveProperty("installationLinkTokenHash");
    expect(status.request).not.toHaveProperty("syncTokenHash");
    const token = String(status.oneTimeSyncToken);
    expect(token.length).toBeGreaterThanOrEqual(40);

    // Only the hash is stored, and it authenticates exactly this installation and project.
    const installations = new InstallationsPostgresDatasource();
    const hash = createHash("sha256").update(token).digest("hex");
    const stored = await db.localInstallation.findUniqueOrThrow({ where: { installationId: tag("inst-2") } });
    expect(stored.syncTokenHash).toBe(hash);
    expect(await installations.authenticateSyncToken(tag("inst-2"), hash)).toEqual({ installationId: tag("inst-2"), proyectoId, rotationRequested: false });
    expect(await installations.authenticateSyncToken(tag("other"), hash)).toBeNull();

    // Asking again (e.g. the answer was lost) issues a new token and retires the previous one.
    const again = await sync.getInstallationRequestStatus(tag("inst-2"), proyectoId);
    expect(again.oneTimeSyncToken).not.toBe(token);
    expect(await installations.authenticateSyncToken(tag("inst-2"), hash)).toBeNull();
  });

  it("stores heartbeats and mirrors the device state of the project's modules only", async () => {
    const foreignModulo = await modulos.create({
      nombre: "Ajeno",
      proyecto: otherProyectoId,
      tipo: "SALIDA",
      estado: true,
      identificador: tag("ajeno"),
      submodulos: [],
    } as unknown as Parameters<typeof modulos.create>[0]);
    const result = await sync.receiveHeartbeatSnapshot({
      installationId,
      proyectoId,
      generatedAt: Date.now(),
      source: "operativo",
      summary: { tickets: 3 },
      modules: [
        {
          id: moduloId,
          connectionStatus: "connected",
          heartbeatStatus: "online",
          isConnected: true,
          isAuthorized: true,
          lastHeartbeatAt: Date.now(),
          deviceBinding: { fingerprint: "fp-1", boundAt: Date.now(), lastSeenAt: Date.now() },
          deviceBindingRequests: [{ fingerprint: "fp-2", status: "pending", requestedAt: Date.now() }],
          remoteSupport: { provider: "RUSTDESK", enabled: true, deviceId: "rd-1" },
        },
        { id: foreignModulo.id, isConnected: true },
      ],
    });
    expect(result.accepted).toBe(true);

    const modulo = await modulos.findById(moduloId);
    expect(modulo?.deviceBinding?.fingerprint).toBe("fp-1");
    expect(modulo?.deviceBindingRequests?.[0]).toMatchObject({ fingerprint: "fp-2", status: "PENDING" });
    expect(modulo?.deviceRuntimeSnapshot).toMatchObject({ connectionStatus: "CONNECTED", heartbeatStatus: "online", isConnected: true });
    expect(modulo?.remoteSupport).toMatchObject({ provider: "RUSTDESK", deviceId: "rd-1" });
    expect((await modulos.findById(foreignModulo.id))?.deviceRuntimeSnapshot).toBeNull();

    const live = await new LocalProjectsPostgresDatasource().getHeartbeat(proyectoId);
    expect(live).toMatchObject({ status: "missing-local-url", snapshot: { snapshot: { proyectoId, summary: { tickets: 3 } } } });
    expect((await sync.receiveHeartbeatSnapshot({ installationId, proyectoId: randomUUID(), generatedAt: 0, source: "x", summary: {}, modules: [] })).accepted).toBe(false);
    await db.modulo.delete({ where: { id: foreignModulo.id } });
  });

  it("accepts each event once", async () => {
    const event = { eventId: tag("evt-1"), installationId, proyectoId, eventType: "ticket.paid", aggregateId: "t-1", occurredAt: Date.now(), payload: { monto: 30 } };
    expect(await sync.receiveEvent(event)).toMatchObject({ accepted: true, duplicate: false });
    expect(await sync.receiveEvent(event)).toMatchObject({ accepted: true, duplicate: true });
    await expect(sync.receiveEvent({ ...event, eventId: tag("evt-2"), proyectoId: randomUUID() })).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("JobLockPostgresDatasource", () => {
  it("lets one owner hold a job lease until it is released or expires", async () => {
    const name = tag("job");
    expect(await locks.tryAcquire(name, "instance-a", 60_000)).toBe(true);
    expect(await locks.tryAcquire(name, "instance-b", 60_000)).toBe(false);
    expect(await locks.tryAcquire(name, "instance-a", 60_000)).toBe(true);
    await locks.release(name, "instance-b");
    expect(await locks.tryAcquire(name, "instance-b", 60_000)).toBe(false);
    await locks.release(name, "instance-a");
    expect(await locks.tryAcquire(name, "instance-b", 50)).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(await locks.tryAcquire(name, "instance-c", 60_000)).toBe(true);
  });

  it("gives a free lease to exactly one of many concurrent instances", async () => {
    const name = tag("race");
    const results = await Promise.all(Array.from({ length: 6 }, (_, index) => locks.tryAcquire(name, `instance-${index}`, 60_000)));
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});
