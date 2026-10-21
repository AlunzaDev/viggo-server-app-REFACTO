import express from "express";
import { createHash, randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresDatabase } from "../../src/data/postgres";
import { SyncRoutes } from "../../src/presentation/routes/sync/sync.routes";

// What an installation's OPERATIVO does over /api/sync besides linking: take the app's
// commands and answer them (with retries and dead letters), send events and heartbeats.
const db = () => PostgresDatabase.client;
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const tag = randomUUID().slice(0, 8);
const LINK = `link-${randomUUID()}`;
const INSTALLATION = `inst-cmd-${tag}`;

let server: Server;
let baseUrl = "";
let proyectoId = "";
let userId = "";
let token = "";

const call = async (method: string, path: string, body?: unknown, auth = token) => {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { Authorization: `Bearer ${auth}`, "X-Viggo-Installation-Id": INSTALLATION, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
};

const command = (maxAttempts: number, extra: Record<string, unknown> = {}) => db().mobileOperation.create({ data: {
  operationId: randomUUID(), idempotencyKey: `cmd-${randomUUID()}`, type: "CREATE_TICKET", installationId: INSTALLATION, proyectoId,
  usuarioId: userId, payload: {}, status: "pending", attempts: 0, maxAttempts, nextRetryAt: new Date(), ...extra,
} });

describe("sync commands, events and heartbeats (HTTP)", () => {
  beforeAll(async () => {
    await PostgresDatabase.connect({ databaseUrl: process.env.DATABASE_URL!, poolMax: 3 });
    proyectoId = (await db().proyecto.create({ data: { nombre: `Cmd ${tag}`, coordinates: [0, 0], ciudad: "GDL", identificador: `cmd-${tag}`,
      installationLinkTokenHash: sha256(LINK), installationLinkTokenEncrypted: "ciphertext" } })).id;
    userId = (await db().usuario.create({ data: { nombre: "App", apellido: tag, correo: `cmd-${tag}@example.com`, telefono: `cmd${tag}`,
      password: "hash", allowedApps: ["OPERATIVE_MOBILE"] } })).id;

    const app = express();
    app.use(express.json());
    app.use("/api/sync", SyncRoutes.routes);
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/sync`;

    await call("POST", "/installation-requests", { localApiBaseUrl: "http://10.0.0.9:3002" }, LINK);
    await db().localInstallation.update({ where: { installationId: INSTALLATION }, data: { status: "approved" } });
    token = (await call("GET", "/installation-request/status", undefined, LINK)).body.oneTimeSyncToken;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    await db().operationalIncident.deleteMany({ where: { installationId: INSTALLATION } });
    await db().mobileOperation.deleteMany({ where: { installationId: INSTALLATION } });
    await db().inboxEvent.deleteMany({ where: { installationId: INSTALLATION } });
    await db().projectHeartbeatSnapshot.deleteMany({ where: { proyectoId } });
    await db().localInstallation.deleteMany({ where: { installationId: INSTALLATION } });
    await db().usuario.deleteMany({ where: { id: userId } });
    await db().proyecto.deleteMany({ where: { id: proyectoId } });
    await PostgresDatabase.disconnect();
  });

  describe("mobile commands", () => {
    it("answers 204 when there is nothing to do, and records the poll", async () => {
      const before = Date.now();
      expect((await call("GET", "/mobile-commands/next")).status).toBe(204);
      const installation = await db().localInstallation.findUniqueOrThrow({ where: { installationId: INSTALLATION } });
      expect(installation.lastCommandPollAt!.getTime()).toBeGreaterThanOrEqual(before - 1000);
    });

    it("hands out the oldest due command and completes it once", async () => {
      const created = await command(3);
      const claimed = await call("GET", "/mobile-commands/next");
      expect(claimed).toMatchObject({ status: 200, body: { operation: { operationId: created.operationId, status: "processing", attempts: 1 } } });

      const done = await call("POST", `/mobile-commands/${created.operationId}/complete`, { success: true, result: { ticket: { uid: "t1" } } });
      expect(done).toMatchObject({ status: 200, body: { operation: { status: "completed", result: { ticket: { uid: "t1" } } } } });
      // A repeated answer keeps the first one.
      const again = await call("POST", `/mobile-commands/${created.operationId}/complete`, { success: false, error: "tarde" });
      expect(again).toMatchObject({ status: 200, body: { operation: { status: "completed" } } });
      expect((await call("POST", `/mobile-commands/${randomUUID()}/complete`, { success: true })).status).toBe(404);
    });

    it("retries a failed command later, and sends it to dead letter with an incident when it runs out", async () => {
      const retried = await command(3);
      await call("GET", "/mobile-commands/next");
      const before = Date.now();
      const failed = await call("POST", `/mobile-commands/${retried.operationId}/complete`, { success: false, error: "Sin papel" });
      expect(failed.body.operation).toMatchObject({ status: "failed", error: "Sin papel" });
      // First retry 30 s later.
      expect(failed.body.operation.nextRetryAt).toBeGreaterThanOrEqual(before + 30_000 - 1000);
      expect(failed.body.operation.nextRetryAt).toBeLessThanOrEqual(Date.now() + 30_000 + 1000);
      await db().mobileOperation.update({ where: { operationId: retried.operationId }, data: { status: "dead_letter" } });

      const last = await command(1, { type: "APPLY_TICKET_PAYMENT" });
      await call("GET", "/mobile-commands/next");
      const dead = await call("POST", `/mobile-commands/${last.operationId}/complete`, { success: false });
      expect(dead.body.operation).toMatchObject({ status: "dead_letter", error: "No se pudo ejecutar la operacion" });
      // The next poll opens an incident; a payment that never reached the parking is critical.
      await call("GET", "/mobile-commands/next");
      const incident = await db().operationalIncident.findUnique({ where: { incidentKey: `mobile-operation-dead-letter:${last.operationId}` } });
      expect(incident).toMatchObject({ type: "MOBILE_OPERATION_DEAD_LETTER", severity: "critical", status: "open", proyectoId });
    });

    it("expires commands whose time passed before handing them out", async () => {
      const late = await command(3, { expiresAt: new Date(Date.now() - 1000) });
      expect((await call("GET", "/mobile-commands/next")).status).toBe(204);
      expect(await db().mobileOperation.findUniqueOrThrow({ where: { operationId: late.operationId } })).toMatchObject({ status: "expired" });
    });
  });

  describe("events and heartbeats", () => {
    const event = () => ({ eventId: randomUUID(), proyectoId, eventType: "ticket.created", aggregateId: randomUUID(), occurredAt: Date.now(), payload: {} });

    it("accepts an event once and answers a repeat as duplicate", async () => {
      const sent = event();
      expect(await call("POST", "/events", sent)).toMatchObject({ status: 202, body: { accepted: true } });
      expect(await call("POST", "/events", sent)).toMatchObject({ status: 200, body: { duplicate: true } });
    });

    it("validates events", async () => {
      expect(await call("POST", "/events", { ...event(), eventId: "" })).toMatchObject({ status: 400, body: { error: "eventId, proyectoId, eventType y aggregateId son requeridos" } });
      expect(await call("POST", "/events", { ...event(), occurredAt: "ayer" })).toMatchObject({ status: 400, body: { error: "occurredAt debe ser numerico" } });
      expect(await call("POST", "/events", { ...event(), payload: [] })).toMatchObject({ status: 400, body: { error: "payload debe ser un objeto" } });
    });

    it("accepts and validates heartbeats", async () => {
      const heartbeat = { proyectoId, generatedAt: Date.now(), summary: { modules: 0 }, modules: [] };
      expect((await call("POST", "/heartbeat-snapshot", heartbeat)).status).toBe(202);
      expect(await call("POST", "/heartbeat-snapshot", { ...heartbeat, proyectoId: "" })).toMatchObject({ status: 400, body: { error: "proyectoId es requerido" } });
      expect(await call("POST", "/heartbeat-snapshot", { ...heartbeat, generatedAt: "x" })).toMatchObject({ status: 400, body: { error: "generatedAt debe ser numerico" } });
      expect(await call("POST", "/heartbeat-snapshot", { ...heartbeat, summary: null })).toMatchObject({ status: 400, body: { error: "summary es requerido" } });
      expect(await call("POST", "/heartbeat-snapshot", { ...heartbeat, modules: {} })).toMatchObject({ status: 400, body: { error: "modules debe ser un arreglo" } });
    });

    it("validates user lookups", async () => {
      expect(await call("GET", "/access-user/by-correo/alguien@example.com")).toMatchObject({ status: 400, body: { error: "app es requerida y debe ser una aplicación válida" } });
      expect((await call("GET", `/access-user/by-correo/nadie-${tag}@example.com?app=OPERATIVE_WEB`)).status).toBe(404);
      expect((await call("GET", `/access-user/by-telefono/000${tag}?app=OPERATIVE_WEB`)).status).toBe(404);
    });
  });
});
