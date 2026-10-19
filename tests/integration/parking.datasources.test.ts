import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "../../src/generated/prisma/client";
import { PostgresDatabase } from "../../src/data/postgres";
import { UniqueConstraintError } from "../../src/domain/errors/unique-constraint.error";
import type { ProyectoEntity } from "../../src/domain/entities/parking/proyecto.entity";
import type { ModuloEntity } from "../../src/domain/entities/parking/modulo.entity";
import { InstallationsPostgresDatasource } from "../../src/infrastructure/datasources/installations/installations.datasource.postgres";
import { ModuloPostgresDatasource } from "../../src/infrastructure/datasources/parking/modulo.datasource.postgres";
import { ProyectoPostgresDatasource } from "../../src/infrastructure/datasources/parking/proyecto.datasource.postgres";

let db: PrismaClient;
const suffix = Date.now().toString(36);
const tag = (value: string) => `t-${suffix}-${value}`;

const proyectos = new ProyectoPostgresDatasource();
const modulos = new ModuloPostgresDatasource();
const installations = new InstallationsPostgresDatasource();

const newProyecto = (name: string, overrides: Partial<Omit<ProyectoEntity, "id">> = {}): Omit<ProyectoEntity, "id"> => ({
  nombre: name,
  coordinates: [-103.35, 20.67],
  ciudad: "Guadalajara",
  identificador: tag(name),
  estado: true,
  ...overrides,
});

const newModulo = (proyecto: string, name: string, overrides: Partial<Omit<ModuloEntity, "id">> = {}) =>
  ({
    nombre: name,
    proyecto,
    tipo: "ENTRADA",
    estado: true,
    identificador: tag(name),
    submodulos: [],
    ...overrides,
  }) as Omit<ModuloEntity, "id">;

const cleanup = async () => {
  await db.localInstallation.deleteMany({ where: { installationId: { startsWith: tag("") } } });
  await db.modulo.deleteMany({ where: { identificador: { startsWith: tag("") } } });
  await db.proyecto.deleteMany({ where: { identificador: { startsWith: tag("") } } });
};

beforeAll(async () => {
  db = await PostgresDatabase.connect({ databaseUrl: process.env.DATABASE_URL!, poolMax: 2 });
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  await PostgresDatabase.disconnect();
});

describe("ProyectoPostgresDatasource", () => {
  let proyectoId = "";
  let token = "";

  it("creates a project with a sequential code and a link token bound to it", async () => {
    const first = await proyectos.create(newProyecto("uno", { serverMac: "aa:bb:cc" }));
    const second = await proyectos.create(newProyecto("dos"));
    proyectoId = first.proyecto.id;
    token = first.installationLinkToken;

    expect(first.proyecto.codigoProyecto).toMatch(/^\d{4}$/);
    expect(Number(second.proyecto.codigoProyecto)).toBe(Number(first.proyecto.codigoProyecto) + 1);
    expect(token.startsWith(`viggo-${first.proyecto.codigoProyecto}-`)).toBe(true);
    expect(first.proyecto.serverMac).toBe("AA:BB:CC");
    expect(first.proyecto.remoteSupport).toBeNull();

    const stored = await db.proyecto.findUniqueOrThrow({ where: { id: proyectoId } });
    expect(stored.installationLinkTokenHash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(stored.installationLinkTokenEncrypted).not.toContain(token);
  });

  it("shows the stored token again and can regenerate it", async () => {
    expect((await proyectos.getInstallationLinkToken(proyectoId))?.installationLinkToken).toBe(token);
    const regenerated = await proyectos.regenerateInstallationLinkToken(proyectoId);
    expect(regenerated?.installationLinkToken).not.toBe(token);
    expect((await proyectos.getInstallationLinkToken(proyectoId))?.installationLinkToken).toBe(
      regenerated?.installationLinkToken,
    );
  });

  it("keeps an explicit project code and rejects a duplicated identifier", async () => {
    const imported = await proyectos.create(newProyecto("import", { codigoProyecto: "9001" }));
    expect(imported.proyecto.codigoProyecto).toBe("9001");
    await expect(proyectos.create(newProyecto("uno"))).rejects.toBeInstanceOf(UniqueConstraintError);
  });

  it("stores point and polygon coordinates", async () => {
    const polygon = [[-103.1, 20.1], [-103.2, 20.2], [-103.3, 20.1]];
    const created = await proyectos.create(newProyecto("poly", { coordinates: polygon }));
    expect((await proyectos.findById(created.proyecto.id))?.coordinates).toEqual(polygon);
    expect((await proyectos.findById(proyectoId))?.coordinates).toEqual([-103.35, 20.67]);
  });

  it("creates, updates and removes remote support with the project", async () => {
    const withSupport = await proyectos.update(proyectoId, {
      remoteSupport: { provider: "MESHCENTRAL", enabled: true, baseUrl: "https://mesh.example.com", groupId: "g1" },
    });
    expect(withSupport?.remoteSupport).toEqual({
      provider: "MESHCENTRAL",
      enabled: true,
      baseUrl: "https://mesh.example.com",
      groupId: "g1",
    });

    const renamed = await proyectos.update(proyectoId, { nombre: "Uno renombrado" });
    expect(renamed?.nombre).toBe("Uno renombrado");
    expect(renamed?.remoteSupport?.groupId).toBe("g1");

    expect((await proyectos.update(proyectoId, { remoteSupport: null }))?.remoteSupport).toBeNull();
    expect(await proyectos.update(randomUUID(), { nombre: "x" })).toBeNull();
    expect(await proyectos.findById("64b7f0c2e4b0a1a2b3c4d5e6")).toBeNull();
    expect((await proyectos.findByIdentificador(tag("uno")))?.id).toBe(proyectoId);
  });
});

describe("ModuloPostgresDatasource", () => {
  let proyectoId = "";
  let moduloId = "";

  beforeAll(async () => {
    proyectoId = (await proyectos.create(newProyecto("mods"))).proyecto.id;
  });

  it("creates a module with ordered sub-modules and remote support", async () => {
    const created = await modulos.create(
      newModulo(proyectoId, "entrada", {
        coordinates: [-103.4, 20.6],
        remoteSupport: { provider: "RUSTDESK", enabled: true, deviceId: "dev-1" },
        submodulos: [
          { submoduloId: "QR-1", nombre: "Lector", tipo: "QR_SCANNER", estado: true },
          { submoduloId: "", nombre: "Pluma", tipo: "BARRIER", estado: true, coordinates: [-103.41, 20.61] },
        ],
      }),
    );
    moduloId = created.id;

    expect(created.proyecto).toBe(proyectoId);
    expect(created.coordinates).toEqual([-103.4, 20.6]);
    expect(created.remoteSupport).toMatchObject({ provider: "RUSTDESK", enabled: true, deviceId: "dev-1" });
    expect(created.submodulos.map((item) => item.nombre)).toEqual(["Lector", "Pluma"]);
    expect(created.submodulos[0].submoduloId).toBe("QR-1");
    expect(created.submodulos[1].submoduloId).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.submodulos[1].coordinates).toEqual([-103.41, 20.61]);
    expect(created.deviceBinding).toBeNull();
    expect(created.deviceRuntimeSnapshot).toBeNull();
  });

  it("rejects modules for unknown projects or duplicated identifiers", async () => {
    await expect(modulos.create(newModulo(randomUUID(), "huerfano"))).rejects.toMatchObject({ statusCode: 400 });
    await expect(modulos.create(newModulo("abc", "huerfano2"))).rejects.toMatchObject({ statusCode: 400 });
    await expect(modulos.create(newModulo(proyectoId, "entrada"))).rejects.toBeInstanceOf(UniqueConstraintError);
  });

  it("adds, updates and deletes sub-modules like before", async () => {
    const added = await modulos.addSubmodulo(moduloId, { submoduloId: "CAM-1", nombre: "Cámara", tipo: "CAMERA" });
    expect(added).toMatchObject({ submoduloId: "CAM-1", tipo: "CAMERA", estado: true });
    expect((await modulos.getSubmodulos(moduloId))?.map((item) => item.submoduloId).slice(-1)).toEqual(["CAM-1"]);

    await expect(
      modulos.addSubmodulo(moduloId, { submoduloId: "QR-1", nombre: "Otro", tipo: "OTHER" }),
    ).rejects.toMatchObject({ statusCode: 400 });

    const renamed = await modulos.updateSubmodulo(moduloId, "CAM-1", {
      submoduloId: "CAM-2",
      nombre: "Cámara salida",
      tipo: "CAMERA",
      estado: false,
    });
    expect(renamed).toMatchObject({ submoduloId: "CAM-2", nombre: "Cámara salida", estado: false });
    await expect(
      modulos.updateSubmodulo(moduloId, "CAM-2", { submoduloId: "QR-1", nombre: "x", tipo: "OTHER" }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(modulos.updateSubmodulo(moduloId, "NOPE", { nombre: "x", tipo: "OTHER" })).rejects.toMatchObject({
      statusCode: 404,
    });

    const afterDelete = await modulos.deleteSubmodulo(moduloId, "CAM-2");
    expect(afterDelete?.submodulos.map((item) => item.submoduloId)).not.toContain("CAM-2");
    await expect(modulos.deleteSubmodulo(moduloId, "CAM-2")).rejects.toMatchObject({ statusCode: 404 });
    await expect(modulos.addSubmodulo(randomUUID(), { nombre: "x", tipo: "OTHER" })).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(await modulos.getSubmodulos(randomUUID())).toBeNull();
  });

  it("updates fields, clears coordinates and removes remote support", async () => {
    const updated = await modulos.update(moduloId, { nombre: "Entrada principal", coordinates: [] as unknown as [number, number] });
    expect(updated?.nombre).toBe("Entrada principal");
    expect(updated?.coordinates).toBeUndefined();
    expect(updated?.submodulos).toHaveLength(2);
    expect((await modulos.update(moduloId, { remoteSupport: null }))?.remoteSupport).toBeNull();
    expect(await modulos.update(randomUUID(), { nombre: "x" })).toBeNull();
  });

  it("filters by project, type and status", async () => {
    await modulos.create(newModulo(proyectoId, "salida", { tipo: "SALIDA", estado: false }));
    expect((await modulos.getByProyecto(proyectoId)).map((item) => item.tipo)).toEqual(["ENTRADA", "SALIDA"]);
    expect((await modulos.getFiltered({ proyecto: proyectoId, tipo: "SALIDA" })).map((item) => item.nombre)).toEqual(["salida"]);
    expect(await modulos.getFiltered({ proyecto: proyectoId, estado: true })).toHaveLength(1);
    expect(await modulos.getByProyecto("not-a-uuid")).toEqual([]);
    expect((await modulos.findByIdentificador(tag("salida")))?.estado).toBe(false);
  });

  it("refuses to delete a project that still has modules", async () => {
    await expect(proyectos.delete(proyectoId)).rejects.toMatchObject({ statusCode: 409 });
    for (const modulo of await modulos.getByProyecto(proyectoId)) {
      expect((await modulos.delete(modulo.id))?.id).toBe(modulo.id);
    }
    expect((await proyectos.delete(proyectoId))?.id).toBe(proyectoId);
    expect(await proyectos.findById(proyectoId)).toBeNull();
  });
});

describe("InstallationsPostgresDatasource", () => {
  let proyectoId = "";
  let requestId = "";

  beforeAll(async () => {
    const created = await proyectos.create(newProyecto("inst"));
    proyectoId = created.proyecto.id;
    const row = await db.localInstallation.create({
      data: {
        installationId: tag("inst-1"),
        proyectoId,
        localApiBaseUrl: "http://192.168.1.10:3002",
        serverIp: "192.168.1.10",
        serverMac: "AA:BB",
        browserLongitude: -103.3,
        browserLatitude: 20.6,
        requestedByUserName: "Operador",
      },
    });
    requestId = row.id;
  });

  it("lists requests with the project name and epoch timestamps", async () => {
    const request = (await installations.getRequests()).find((item) => item.id === requestId);
    expect(request).toMatchObject({
      installationId: tag("inst-1"),
      proyectoNombre: "inst",
      status: "pending",
      lastCommandPollAt: 0,
      browserCoordinates: [-103.3, 20.6],
    });
    expect(typeof request?.requestedAt).toBe("number");
    expect(request).not.toHaveProperty("syncTokenHash");
  });

  it("approves a request and copies the server data to the project", async () => {
    const approved = await installations.approveRequest({ requestId, userId: "not-a-uuid", userName: "Admin", note: "ok" });
    expect(approved).toMatchObject({ status: "approved", reviewedByUserName: "Admin", reviewNote: "ok" });

    const proyecto = await proyectos.findById(proyectoId);
    expect(proyecto?.localApiBaseUrl).toBe("http://192.168.1.10:3002");
    expect(proyecto?.serverIp).toBe("192.168.1.10");

    expect((await installations.findApprovedByProyectoId(proyectoId))?.installationId).toBe(tag("inst-1"));
    // The sync token is issued when the installation asks for its status, not on approval.
    expect(await installations.authenticateSyncToken(tag("inst-1"), "")).toBeNull();
    expect(await installations.approveRequest({ requestId: randomUUID(), userId: "x", userName: "x" })).toBeNull();
  });

  it("reports connectivity from the last poll; never polled counts as offline", async () => {
    const now = Date.now();
    let summary = await installations.getConnectivitySummary(now - 15_000, now - 60_000);
    expect(summary.offline.map((item) => item.installationId)).toContain(tag("inst-1"));

    await installations.recordCommandPoll(tag("inst-1"), now);
    summary = await installations.getConnectivitySummary(now - 15_000, now - 60_000);
    expect(summary.offline.map((item) => item.installationId)).not.toContain(tag("inst-1"));
    expect(summary.online).toBeGreaterThanOrEqual(1);
    expect((await installations.findByInstallationId(tag("inst-1")))?.lastCommandPollAt).toBe(now);
  });

  it("unlinks temporarily and permanently, and rejects", async () => {
    expect((await installations.unlinkTemporary({ requestId, userId: "", userName: "Admin" }))?.status).toBe("pending");
    expect((await installations.findByInstallationId(tag("inst-1")))?.syncTokenIssuedAt).toBe(0);
    expect((await installations.unlinkPermanent({ requestId, userId: "", userName: "Admin" }))?.reviewNote).toBe(
      "Desvinculacion definitiva solicitada desde administrativo",
    );
    expect((await installations.rejectRequest({ requestId, userId: "", userName: "Admin", note: "no" }))?.status).toBe(
      "rejected",
    );
    expect(await installations.rejectRequest({ requestId: "bad", userId: "", userName: "", note: "" })).toBeNull();
  });
});
