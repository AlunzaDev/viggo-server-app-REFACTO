import express from "express";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PostgresDatabase } from "../../src/data/postgres";
import { buildMobileOperationController } from "../../src/presentation/dependencies/mobile.dependencies";
import { buildMobileOperationRepository } from "../../src/presentation/dependencies/repositories.dependencies";

// The app's ticket flow through OPERATIVO: entry, quote and card payment, exit, history.
const db = () => PostgresDatabase.client;
const tag = randomUUID().slice(0, 8);
const ids = { project: randomUUID(), other: randomUUID(), entrada: randomUUID(), salida: randomUUID(), foreignSalida: randomUUID() };
const installationId = `inst-${tag}`;
const operations = buildMobileOperationRepository();
let server: Server;
let base = "";
let userId = "";
let strangerId = "";

/** A module QR: ADMIN only reads the module id from it (OPERATIVO verifies the signature). */
const moduleToken = (id: string) => `h.${Buffer.from(JSON.stringify({ id })).toString("base64url")}.s`;

/** Fake OPERATIVO: takes the next command and answers it by type, like the real one. */
type Reply = { result?: Record<string, unknown>; error?: string };
let answer: (operation: { type: string; payload: Record<string, unknown> }) => Reply;
const ticket = (uid: string, extra: Record<string, unknown> = {}) => ({ uid, proyecto: { _id: ids.project }, monto: 40, pagado: false, ...extra });
const defaultAnswer = (operation: { type: string; payload: Record<string, unknown> }): Reply => {
  switch (operation.type) {
    case "CREATE_TICKET": return { result: { ticket: ticket(`t-${randomUUID()}`) } };
    case "QUOTE_TICKET": return { result: { amount: 40 } };
    case "APPLY_TICKET_PAYMENT": return { result: { ticket: ticket(String(operation.payload.ticketId), { pagado: true }) } };
    case "EXIT_TICKET": return { result: { ticket: ticket("exit", { horaSalida: Date.now() }) } };
    default: return { error: "Comando desconocido" };
  }
};
let installationLoop: NodeJS.Timeout;
let online = true;

const call = (method: string, path: string, body?: Record<string, unknown>, key: string | null = `key-${randomUUID()}`, user = userId) =>
  fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json", "X-User": user, ...(key ? { "Idempotency-Key": key } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (response) => ({ status: response.status, body: response.status === 204 ? {} : await response.json() as Record<string, any> }));

/** Enters through the app and waits for OPERATIVO to create the ticket. */
const enter = async () => {
  const created = await call("POST", "/tickets", { projectId: ids.project, moduleToken: moduleToken(ids.entrada) });
  for (let i = 0; i < 50; i += 1) {
    const operation = await call("GET", `/operations/${created.body.operation.operationId}`, undefined, null);
    if (operation.body.operation?.status === "completed") return operation.body.operation.result.ticket as { uid: string };
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("OPERATIVO did not create the ticket");
};

describe("App tickets (/api/mobile/tickets)", () => {
  beforeAll(async () => {
    await PostgresDatabase.connect({ databaseUrl: process.env.DATABASE_URL!, poolMax: 4 });
    const user = (correo: string) => db().usuario.create({ data: { nombre: "Cliente", apellido: "Prueba", password: "hash",
      correo, telefono: randomUUID().slice(0, 10), emailValidated: true, allowedApps: ["OPERATIVE_MOBILE"] } });
    userId = (await user(`${tag}@example.com`)).id;
    strangerId = (await user(`${tag}-otro@example.com`)).id;
    for (const id of [ids.project, ids.other]) {
      await db().proyecto.create({ data: { id, nombre: `Plaza ${tag}`, coordinates: [], ciudad: "GDL", identificador: `${tag}-${id}` } });
    }
    await db().modulo.createMany({ data: [
      { id: ids.entrada, proyectoId: ids.project, nombre: "Entrada", tipo: "ENTRADA", identificador: `E-${ids.entrada}` },
      { id: ids.salida, proyectoId: ids.project, nombre: "Salida", tipo: "SALIDA", identificador: `S-${ids.salida}` },
      { id: ids.foreignSalida, proyectoId: ids.other, nombre: "Salida otra", tipo: "SALIDA", identificador: `F-${ids.foreignSalida}` },
    ] });
    await db().localInstallation.create({ data: { installationId, proyectoId: ids.project, status: "approved", lastCommandPollAt: new Date() } });

    installationLoop = setInterval(async () => {
      if (!online) return;
      await db().localInstallation.update({ where: { installationId }, data: { lastCommandPollAt: new Date() } }).catch(() => undefined);
      const now = Date.now();
      const operation = await operations.claimNext(installationId, now, 30_000).catch(() => null);
      if (!operation) return;
      const reply = answer(operation as { type: string; payload: Record<string, unknown> });
      await operations.complete(operation.operationId, installationId, reply.error
        ? { status: "failed", error: reply.error, updatedAt: now }
        : { status: "completed", result: reply.result, error: "", completedAt: now, updatedAt: now });
    }, 100);

    const controller = buildMobileOperationController();
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { (req as express.Request & { uid: string }).uid = String(req.header("X-User")); next(); });
    app.post("/tickets", controller.createTicket);
    app.get("/tickets/current", controller.getCurrentTicket);
    app.get("/tickets/history", controller.getTicketHistory);
    app.post("/tickets/exit", controller.exitTicket);
    app.post("/tickets/:ticketId/payment-intent", controller.createTicketPaymentIntent);
    app.post("/tickets/:ticketId/confirm", controller.confirmTicketPayment);
    app.get("/operations/:operationId", controller.getOperation);
    app.get("/payments/history", controller.getPaymentHistory);
    app.get("/payments/history/:paymentId", controller.getPaymentHistoryDetail);
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  beforeEach(() => {
    answer = defaultAnswer;
    online = true;
  });

  afterAll(async () => {
    clearInterval(installationLoop);
    await new Promise((resolve) => server.close(resolve));
    await db().payment.deleteMany({ where: { usuarioId: { in: [userId, strangerId] } } });
    await db().mobileOperation.deleteMany({ where: { installationId } });
    await db().localInstallation.deleteMany({ where: { installationId } });
    await db().modulo.deleteMany({ where: { proyectoId: { in: [ids.project, ids.other] } } });
    await db().proyecto.deleteMany({ where: { id: { in: [ids.project, ids.other] } } });
    await db().usuario.deleteMany({ where: { id: { in: [userId, strangerId] } } });
    await PostgresDatabase.disconnect();
  });

  it("has no current ticket before entering", async () => {
    expect((await call("GET", "/tickets/current", undefined, null)).status).toBe(204);
  });

  describe("entry", () => {
    it("queues the ticket for OPERATIVO and answers 202", async () => {
      const created = await call("POST", "/tickets", { projectId: ids.project, moduleToken: moduleToken(ids.entrada) });
      expect(created).toMatchObject({ status: 202, body: { operation: { type: "CREATE_TICKET", status: "pending", proyectoId: ids.project, installationId } } });
      const stored = await db().mobileOperation.findFirstOrThrow({ where: { operationId: created.body.operation.operationId } });
      expect(stored.maxAttempts).toBe(3);
      expect(stored.expiresAt!.getTime() - stored.createdAt.getTime()).toBe(30_000);
    });

    it("answers a repeated key with the same operation, and refuses it for another user", async () => {
      const key = `key-${randomUUID()}`;
      const body = { projectId: ids.project, moduleToken: moduleToken(ids.entrada) };
      const first = await call("POST", "/tickets", body, key);
      const again = await call("POST", "/tickets", body, key);
      expect([200, 202]).toContain(again.status);
      expect(again.body.operation.operationId).toBe(first.body.operation.operationId);
      expect((await call("POST", "/tickets", body, key, strangerId)).status).toBe(409);
    });

    it("validates the request and the QR", async () => {
      const body = { projectId: ids.project, moduleToken: moduleToken(ids.entrada) };
      expect(await call("POST", "/tickets", body, "corta")).toMatchObject({ status: 400, body: { error: "Idempotency-Key invalida" } });
      expect(await call("POST", "/tickets", { projectId: ids.project })).toMatchObject({ status: 400, body: { error: "moduleToken es requerido" } });
      expect(await call("POST", "/tickets", { moduleToken: body.moduleToken })).toMatchObject({ status: 400, body: { error: "projectId es requerido" } });
      expect(await call("POST", "/tickets", { ...body, moduleToken: "basura" })).toMatchObject({ status: 400, body: { error: "El QR no identifica un modulo valido" } });
      // An exit QR, or the client claiming another parking.
      expect(await call("POST", "/tickets", { ...body, moduleToken: moduleToken(ids.salida) })).toMatchObject({ status: 409, body: { code: "PARKING_QR_MISMATCH" } });
      expect(await call("POST", "/tickets", { ...body, projectId: ids.other })).toMatchObject({ status: 409, body: { code: "PARKING_QR_MISMATCH" } });
    });

    it("does not create a ticket when the parking is offline", async () => {
      online = false;
      await db().localInstallation.update({ where: { installationId }, data: { lastCommandPollAt: new Date(Date.now() - 60_000) } });
      const before = await db().mobileOperation.count({ where: { installationId } });
      expect(await call("POST", "/tickets", { projectId: ids.project, moduleToken: moduleToken(ids.entrada) })).toMatchObject({
        status: 503, body: { error: "El estacionamiento esta desconectado; no se genero el ticket" },
      });
      expect(await db().mobileOperation.count({ where: { installationId } })).toBe(before);
      online = true;
      await db().localInstallation.update({ where: { installationId }, data: { lastCommandPollAt: new Date() } });
    });
  });

  describe("card payment", () => {
    it("quotes with OPERATIVO, creates the intent once per key and applies the payment", async () => {
      const current = await enter();
      expect((await call("GET", "/tickets/current", undefined, null)).body.ticket.uid).toBe(current.uid);

      const key = `pay-${randomUUID()}`;
      const intent = await call("POST", `/tickets/${current.uid}/payment-intent`, undefined, key);
      expect(intent).toMatchObject({ status: 201, body: { paymentIntent: { amount: 4000, status: "requires_payment_method", clientSecret: expect.any(String) } } });
      // Same key: the same intent, never a second charge.
      const again = await call("POST", `/tickets/${current.uid}/payment-intent`, undefined, key);
      expect(again).toMatchObject({ status: 200, body: { paymentIntent: { id: intent.body.paymentIntent.id } } });
      expect((await call("POST", `/tickets/${current.uid}/payment-intent`, undefined, key, strangerId)).status).toBe(409);

      const confirmed = await call("POST", `/tickets/${current.uid}/confirm`, { paymentIntentId: intent.body.paymentIntent.id }, null);
      expect(confirmed).toMatchObject({ status: 200, body: { payment: { status: "succeeded" }, operation: { type: "APPLY_TICKET_PAYMENT" }, ticket: { pagado: true } } });

      const history = await call("GET", "/payments/history?page=1&limit=10", undefined, null);
      expect(history.body).toMatchObject({ total: 1, page: 1, limit: 10, totalPages: 1 });
      const detail = await call("GET", `/payments/history/${history.body.payments[0].id}`, undefined, null);
      expect(detail.status).toBe(200);
      expect((await call("GET", `/payments/history/${history.body.payments[0].id}`, undefined, null, strangerId)).status).toBe(404);
    });

    it("refuses what cannot be charged", async () => {
      expect(await call("POST", "/tickets/no-existe/payment-intent")).toMatchObject({ status: 404, body: { error: "Ticket movil no encontrado" } });
      expect((await call("POST", "/tickets/x/payment-intent", undefined, "corta")).status).toBe(400);
      expect(await call("POST", "/tickets/x/confirm", { paymentIntentId: "pi_no" }, null)).toMatchObject({ status: 404, body: { error: "Pago no encontrado" } });

      const current = await enter();
      answer = (operation) => operation.type === "QUOTE_TICKET" ? { error: "Ticket ya pagado" } : defaultAnswer(operation);
      expect(await call("POST", `/tickets/${current.uid}/payment-intent`)).toMatchObject({ status: 503, body: { error: "Ticket ya pagado" } });
      answer = (operation) => operation.type === "QUOTE_TICKET" ? { result: { amount: 0 } } : defaultAnswer(operation);
      expect(await call("POST", `/tickets/${current.uid}/payment-intent`)).toMatchObject({ status: 409, body: { error: "La cotizacion local no es valida" } });
    });
  });

  describe("exit", () => {
    it("opens the exit of the active ticket's parking", async () => {
      await enter();
      const exit = await call("POST", "/tickets/exit", { projectId: ids.project, moduleToken: moduleToken(ids.salida) });
      expect(exit).toMatchObject({ status: 200, body: { operation: { type: "EXIT_TICKET", status: "completed" }, ticket: { uid: "exit" } } });
    });

    it("refuses an exit QR of another parking, or no active ticket", async () => {
      expect((await call("POST", "/tickets/exit", { projectId: ids.project })).status).toBe(400);
      expect(await call("POST", "/tickets/exit", { projectId: ids.project, moduleToken: moduleToken(ids.entrada) })).toMatchObject({ status: 409, body: { code: "PARKING_QR_MISMATCH" } });
      // The QR and the claimed parking agree, but the active ticket is in another one.
      expect(await call("POST", "/tickets/exit", { projectId: ids.other, moduleToken: moduleToken(ids.foreignSalida) })).toMatchObject({ status: 409, body: { code: "PARKING_TICKET_MISMATCH" } });
      expect(await call("POST", "/tickets/exit", { projectId: ids.project, moduleToken: moduleToken(ids.salida) }, undefined, strangerId))
        .toMatchObject({ status: 404, body: { error: "Ticket activo no encontrado" } });
    });

    it("answers 503 with OPERATIVO's error when the exit fails", async () => {
      await enter();
      answer = (operation) => operation.type === "EXIT_TICKET" ? { error: "Ticket sin pagar" } : defaultAnswer(operation);
      expect(await call("POST", "/tickets/exit", { projectId: ids.project, moduleToken: moduleToken(ids.salida) })).toMatchObject({ status: 503, body: { error: "Ticket sin pagar" } });
    });
  });

  it("lists each ticket once in the history, paginated", async () => {
    const history = await call("GET", "/tickets/history?page=1&limit=2", undefined, null);
    expect(history.status).toBe(200);
    expect(history.body).toMatchObject({ page: 1, limit: 2 });
    const uids = history.body.tickets.map((item: { uid: string }) => item.uid);
    expect(new Set(uids).size).toBe(uids.length);
    expect(history.body.totalPages).toBe(Math.max(1, Math.ceil(history.body.total / 2)));
  });

  it("shows an operation only to its user", async () => {
    const created = await call("POST", "/tickets", { projectId: ids.project, moduleToken: moduleToken(ids.entrada) });
    expect((await call("GET", `/operations/${created.body.operation.operationId}`, undefined, null)).status).toBe(200);
    expect(await call("GET", `/operations/${created.body.operation.operationId}`, undefined, null, strangerId)).toMatchObject({ status: 404, body: { error: "Operacion no encontrada" } });
  });
});
