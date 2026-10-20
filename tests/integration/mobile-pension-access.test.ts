import express from "express";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PostgresDatabase } from "../../src/data/postgres";
import { buildMobileOperationController } from "../../src/presentation/dependencies/mobile.dependencies";
import { buildMobileOperationRepository } from "../../src/presentation/dependencies/repositories.dependencies";

// The app opens a barrier with its Pension Pass through OPERATIVO (#32).
const db = () => PostgresDatabase.client;
const tag = randomUUID().slice(0, 8);
const ids = { project: randomUUID(), other: randomUUID(), entrada: randomUUID(), salida: randomUUID(), foreign: randomUUID(), pos: randomUUID() };
const installationId = `inst-${tag}`;
const operations = buildMobileOperationRepository();
let server: Server;
let base = "";
let userId = "";
let strangerId = "";
let passId = "";
let foreignPassId = "";

/** A module QR: ADMIN only reads the module id from it (OPERATIVO verifies the signature). */
const moduleToken = (id: string) => `h.${Buffer.from(JSON.stringify({ id })).toString("base64url")}.s`;

/** Fake OPERATIVO: takes the next command and answers it like the real one would. */
let answer: ((operation: { payload: Record<string, unknown> }) => { result?: Record<string, unknown>; error?: string }) | null = null;
let installationLoop: NodeJS.Timeout;

const access = (pass: string, body: Record<string, unknown>, key = `key-${randomUUID()}`, user = userId) =>
  fetch(`${base}/pension-pass/${pass}/access`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": key, "X-User": user },
    body: JSON.stringify(body),
  }).then(async (response) => ({ status: response.status, body: await response.json() as Record<string, any> }));

describe("POST /api/mobile/pension-pass/:id/access", () => {
  beforeAll(async () => {
    await PostgresDatabase.connect({ databaseUrl: process.env.DATABASE_URL!, poolMax: 4 });
    const user = (correo: string) => db().usuario.create({ data: { nombre: "Pensionado", apellido: "Prueba", password: "hash",
      correo, telefono: randomUUID().slice(0, 10), emailValidated: true, allowedApps: ["OPERATIVE_MOBILE"] } });
    userId = (await user(`${tag}@example.com`)).id;
    strangerId = (await user(`${tag}-otro@example.com`)).id;
    for (const id of [ids.project, ids.other]) {
      await db().proyecto.create({ data: { id, nombre: `Plaza ${tag}`, coordinates: [], ciudad: "GDL", identificador: `${tag}-${id}` } });
    }
    await db().modulo.createMany({ data: [
      { id: ids.entrada, proyectoId: ids.project, nombre: "Entrada", tipo: "ENTRADA", identificador: `E-${ids.entrada}` },
      { id: ids.salida, proyectoId: ids.project, nombre: "Salida", tipo: "SALIDA", identificador: `S-${ids.salida}` },
      { id: ids.pos, proyectoId: ids.project, nombre: "Cajero", tipo: "POS", identificador: `P-${ids.pos}` },
      { id: ids.foreign, proyectoId: ids.other, nombre: "Entrada otra", tipo: "ENTRADA", identificador: `F-${ids.foreign}` },
    ] });
    const pension = await db().pension.create({ data: { proyectoId: ids.project, nombre: tag, precio: 1500 } });
    const foreignPension = await db().pension.create({ data: { proyectoId: ids.other, nombre: `${tag}-otra`, precio: 1500 } });
    const pass = (pensionId: string, suffix: string) => db().pensionPass.create({ data: { pensionId, usuarioId: userId, name: tag, idPass: `${tag}-${suffix}`,
      vigent: true, validFrom: new Date(Date.now() - 86_400_000), validTo: new Date(Date.now() + 30 * 86_400_000) } });
    passId = (await pass(pension.id, "a")).id;
    foreignPassId = (await pass(foreignPension.id, "b")).id;
    await db().localInstallation.create({ data: { installationId, proyectoId: ids.project, status: "approved", lastCommandPollAt: new Date() } });

    installationLoop = setInterval(async () => {
      await db().localInstallation.update({ where: { installationId }, data: { lastCommandPollAt: new Date() } }).catch(() => undefined);
      if (!answer) return;
      const now = Date.now();
      const operation = await operations.claimNext(installationId, now, 30_000).catch(() => null);
      if (!operation) return;
      const reply = answer(operation);
      await operations.complete(operation.operationId, installationId, reply.error
        ? { status: "failed", error: reply.error, updatedAt: now }
        : { status: "completed", result: reply.result, error: "", completedAt: now, updatedAt: now });
    }, 100);

    const controller = buildMobileOperationController();
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { (req as express.Request & { uid: string }).uid = String(req.header("X-User")); next(); });
    app.post("/pension-pass/:id/access", controller.accessWithPensionPass);
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  beforeEach(() => {
    answer = ({ payload }) => ({ result: { pensionMove: { uid: randomUUID(), tipo: payload.moduleToken === moduleToken(ids.salida) ? "SALIDA" : "ENTRADA", pensionPass: payload.pensionPassId } } });
  });

  afterAll(async () => {
    clearInterval(installationLoop);
    await new Promise((resolve) => server.close(resolve));
    await db().mobileOperation.deleteMany({ where: { installationId } });
    await db().localInstallation.deleteMany({ where: { installationId } });
    await db().pensionPass.deleteMany({ where: { usuarioId: userId } });
    await db().pension.deleteMany({ where: { proyectoId: { in: [ids.project, ids.other] } } });
    await db().modulo.deleteMany({ where: { proyectoId: { in: [ids.project, ids.other] } } });
    await db().proyecto.deleteMany({ where: { id: { in: [ids.project, ids.other] } } });
    await db().usuario.deleteMany({ where: { id: { in: [userId, strangerId] } } });
    await PostgresDatabase.disconnect();
  });

  it("opens the barrier through OPERATIVO and answers the move and the pass state", async () => {
    const entry = await access(passId, { projectId: ids.project, moduleToken: moduleToken(ids.entrada) });
    expect(entry).toMatchObject({ status: 200, body: { pensionMove: { tipo: "ENTRADA" }, pensionPass: { id: passId, inParking: true } } });
    const stored = await db().mobileOperation.findFirstOrThrow({ where: { operationId: entry.body.operation.operationId } });
    // The project comes from the module, and the command lives briefly: a late barrier is worse than none.
    expect(stored).toMatchObject({ type: "PENSION_PASS_ACCESS", proyectoId: ids.project, installationId });
    expect(stored.expiresAt!.getTime() - stored.createdAt.getTime()).toBeLessThanOrEqual(15_000);
    expect(stored.maxAttempts).toBe(1);

    const exit = await access(passId, { projectId: ids.project, moduleToken: moduleToken(ids.salida) });
    expect(exit.body.pensionPass).toEqual({ id: passId, inParking: false });
  });

  it("answers a repeated key with the same result, never a second opening", async () => {
    const key = `key-${randomUUID()}`;
    const first = await access(passId, { projectId: ids.project, moduleToken: moduleToken(ids.entrada) }, key);
    const again = await access(passId, { projectId: ids.project, moduleToken: moduleToken(ids.entrada) }, key);
    expect(again).toMatchObject({ status: 200, body: { operation: { operationId: first.body.operation.operationId } } });
    expect(await db().mobileOperation.count({ where: { idempotencyKey: key } })).toBe(1);
    // The key cannot be reused for another pass or by another user.
    expect((await access(foreignPassId, { projectId: ids.other, moduleToken: moduleToken(ids.foreign) }, key)).status).toBe(409);
    expect((await access(passId, { projectId: ids.project, moduleToken: moduleToken(ids.entrada) }, key, strangerId)).status).toBe(409);
  });

  it("refuses crossings between parking, module and pass", async () => {
    const mismatch = { status: 409, body: { code: "PARKING_QR_MISMATCH" } };
    // A module of another parking, or the client claiming another parking.
    expect(await access(passId, { projectId: ids.other, moduleToken: moduleToken(ids.foreign) })).toMatchObject(mismatch);
    expect(await access(passId, { projectId: ids.other, moduleToken: moduleToken(ids.entrada) })).toMatchObject(mismatch);
    // A pass whose pension belongs to another parking.
    expect(await access(foreignPassId, { projectId: ids.project, moduleToken: moduleToken(ids.entrada) })).toMatchObject(mismatch);
    expect((await access(passId, { projectId: ids.project, moduleToken: moduleToken(ids.pos) })).status).toBe(400);
    expect((await access(passId, { projectId: ids.project, moduleToken: "basura" })).status).toBe(400);
    // Someone else's pass looks like no pass at all.
    expect((await access(passId, { projectId: ids.project, moduleToken: moduleToken(ids.entrada) }, undefined, strangerId)).status).toBe(404);
    expect((await access(passId, { projectId: ids.project }, undefined)).status).toBe(400);
    expect(await db().mobileOperation.count({ where: { installationId, payload: { path: ["pensionPassId"], equals: foreignPassId } } })).toBe(0);
  });

  it("refuses an expired pass without asking OPERATIVO", async () => {
    await db().pensionPass.update({ where: { id: foreignPassId }, data: { validTo: new Date(Date.now() - 1000) } });
    expect(await access(foreignPassId, { projectId: ids.other, moduleToken: moduleToken(ids.foreign) })).toMatchObject({ status: 409, body: { code: "PENSION_PASS_NOT_VALID" } });
  });

  it("passes on OPERATIVO's rejection (anti-passback, schedule)", async () => {
    answer = () => ({ error: "El pase ya se encuentra dentro" });
    expect(await access(passId, { projectId: ids.project, moduleToken: moduleToken(ids.entrada) })).toMatchObject({
      status: 409, body: { code: "PENSION_ACCESS_REJECTED", error: "El pase ya se encuentra dentro" },
    });
  });

  it("does not open when the parking is offline", async () => {
    clearInterval(installationLoop);
    await db().localInstallation.update({ where: { installationId }, data: { lastCommandPollAt: new Date(Date.now() - 60_000) } });
    const before = await db().mobileOperation.count({ where: { installationId } });
    expect(await access(passId, { projectId: ids.project, moduleToken: moduleToken(ids.entrada) })).toMatchObject({ status: 503, body: { code: "PARKING_OFFLINE" } });
    expect(await db().mobileOperation.count({ where: { installationId } })).toBe(before);
  });
});
