import express from "express";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PostgresDatabase } from "../../src/data/postgres";
import { JwtPlugin } from "../../src/config/plugins/jwt.plugin";
import { envs } from "../../src/config";
import { ExternalPaymentService } from "../../src/domain/external-payments/external-payment.service";
import type { ExternalIntent, ExternalOrder, ExternalPaymentGateway, ExternalProviderDirectory, ExternalQuote } from "../../src/domain/external-payments/external-payment";
import { CustomError } from "../../src/domain/errors/custom.error";
import { ExternalOrderPostgresRepository } from "../../src/infrastructure/repositories/payments/external-order.repository.postgres";
import { PaymentPostgresDatasource } from "../../src/infrastructure/datasources/payments/payment.datasource.postgres";
import { HttpProviderClient } from "../../src/infrastructure/external-payments/http-provider.client";
import { externalPaymentRoutes } from "../../src/presentation/routes/payments/external-payment.routes";
import { externalPaymentAdminRoutes } from "../../src/presentation/routes/payments/external-payment-admin.routes";
import { StripeWebhookController } from "../../src/presentation/routes/payments/stripe-webhook.controller";
import { StripePlugin } from "../../src/config/plugins/stripe.plugin";
import { StripeExternalGateway } from "../../src/infrastructure/external-payments/stripe-external.gateway";
import { buildMobileOperationRepository, buildPaymentRepository } from "../../src/presentation/dependencies/repositories.dependencies";
import { AuthMiddleware } from "../../src/presentation/middlewares/auth.middleware";

class FakeStripe implements ExternalPaymentGateway {
  intents = new Map<string, ExternalIntent>();
  creates = 0;
  loseResponse = false;
  async create(order: ExternalOrder) {
    if (!this.intents.has(order.id)) {
      this.creates++;
      this.intents.set(order.id, { id: `pi_test_${order.id}`, orderId: order.id, userId: order.userId,
        amountMinor: order.amountMinor, currency: order.currency, clientSecret: "test-secret", status: "requires_payment_method" });
    }
    if (this.loseResponse) { this.loseResponse = false; throw new Error("Simulated lost Stripe response"); }
    return { ...this.intents.get(order.id)! };
  }
  async retrieve(id: string) { return { ...[...this.intents.values()].find(value => value.id === id)! }; }
  async cancel(id: string) {
    const intent = [...this.intents.values()].find(value => value.id === id)!;
    if (intent.status !== "succeeded") intent.status = "canceled";
    return { ...intent };
  }
  succeed(orderId: string) { const intent = this.intents.get(orderId)!; intent.status = "succeeded"; return { ...intent }; }
}

const db = () => PostgresDatabase.client;
const repository = new ExternalOrderPostgresRepository();
const stripe = new FakeStripe();
const tag = `external-${randomUUID()}`;
let user = "", otherUser = "", token = "", otherToken = "";
// The parking the app detected; its provider (in the catalog) quotes the QR.
const proyectoId = randomUUID();
let superToken = "", adminToken = "", profileId = "";
const staff: string[] = [];
let quote: ExternalQuote;
let service: ExternalPaymentService;
let server: Server, providerServer: Server, base = "";
let confirmationFails = false, confirmationCalls = 0;
let quoteMode = "ok", quoteCalls = 0;
const deliveries = new Set<string>();

const listen = async (app: ReturnType<typeof express>) => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  return { server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
};

const request = async (method: string, path: string, body?: unknown, auth: string | null = token) => {
  const response = await fetch(base + path, { method, headers: {
    "Content-Type": "application/json", ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json() as Record<string, any> };
};

beforeAll(async () => {
  await PostgresDatabase.connect({ databaseUrl: process.env.DATABASE_URL!, poolMax: 8 });
  await db().proyecto.create({ data: { id: proyectoId, nombre: "External parking", coordinates: [], ciudad: "GDL", identificador: `${tag}-parking` } });
  for (const name of ["a", "b"]) {
    const row = await db().usuario.create({ data: { nombre: "External", apellido: "Test", password: "hash",
      correo: `${tag}-${name}@example.com`, telefono: `${tag}-${name}`, emailValidated: true, allowedApps: ["OPERATIVE_MOBILE"] } });
    if (name === "a") user = row.id; else otherUser = row.id;
  }
  token = String(await JwtPlugin.generateToken({ id: user, app: "OPERATIVE_MOBILE" }));
  otherToken = String(await JwtPlugin.generateToken({ id: otherUser, app: "OPERATIVE_MOBILE" }));
  profileId = (await db().permissionProfile.create({ data: { nombre: tag, app: "ADMIN_WEB", modules: ["payments"] } })).id;
  for (const rol of ["SUPER_ROLE", "ADMIN_ROLE"]) {
    const row = await db().usuario.create({ data: { nombre: "Staff", apellido: "Test", password: "hash", rol,
      correo: `${tag}-${rol.toLowerCase()}@example.com`, telefono: `${tag}-${rol}`, emailValidated: true,
      allowedApps: ["ADMIN_WEB"], appPermissions: { create: { app: "ADMIN_WEB", permissionProfileId: profileId } } } });
    staff.push(row.id);
    const jwt = String(await JwtPlugin.generateToken({ id: row.id, app: "ADMIN_WEB" }));
    if (rol === "SUPER_ROLE") superToken = jwt; else adminToken = jwt;
  }

  // These endpoints/payloads are ONLY a fake test protocol, never a claimed SeguriPass API.
  const providerApp = express();
  providerApp.use(express.json());
  providerApp.post("/fake/quote", (req, res) => {
    quoteCalls++;
    // The parking id in the provider's system comes from the detected project.
    if (req.body.parkingId !== "parking-external") return res.sendStatus(404);
    if (quoteMode === "unavailable") return res.sendStatus(503);
    if (quoteMode === "missing") return res.sendStatus(404);
    if (quoteMode === "invalid") return res.send("invalid-json");
    if (quoteMode === "null") return res.json(null);
    if (quoteMode === "timeout") return;
    return res.json(quote);
  });
  providerApp.post("/fake/confirm", (req, res) => {
    confirmationCalls++;
    expect(req.body.amountMinor).toBe(12550);
    expect(req.body.reference).toBe(quote.reference);
    expect(req.body.paymentReference).toMatch(/^pi_test_/);
    const key = req.header("Idempotency-Key")!;
    deliveries.add(key);
    if (confirmationFails) return res.sendStatus(503); // Remote may have applied the payment before losing its response.
    return res.json({ confirmationReference: `confirmed:${key}` });
  });
  const providerHost = await listen(providerApp);
  providerServer = providerHost.server;
  const provider = new HttpProviderClient("seguripass", { baseUrl: providerHost.url, headers: { Authorization: "Bearer test-only" },
    allowLocalHttp: true, timeoutMs: 100,
    protocol: { quoteRequest: (qr, parkingId) => ({ path: "/fake/quote", body: { qr, parkingId } }), readQuote: body => body as ExternalQuote,
      confirmationRequest: input => ({ path: "/fake/confirm", body: input }),
      readConfirmation: body => body as { confirmationReference: string } },
  });
  const directory = {
    forProject: async (id: string) => {
      if (id !== proyectoId) throw CustomError.conflict("El estacionamiento no tiene proveedor de pago", undefined, "PARKING_WITHOUT_PROVIDER");
      return { providerId: "seguripass", parkingId: "parking-external", provider };
    },
    forProvider: async () => provider,
  } as unknown as ExternalProviderDirectory;
  service = new ExternalPaymentService(repository, directory, stripe);
  const app = express();
  app.post("/webhook", express.raw({ type: "application/json" }),
    new StripeWebhookController(buildPaymentRepository(), buildMobileOperationRepository(), service).handle);
  app.use(express.json());
  app.use("/orders-api", AuthMiddleware.requireAuth, AuthMiddleware.requireApps("OPERATIVE_MOBILE"), externalPaymentRoutes(service));
  app.use("/admin-api", externalPaymentAdminRoutes(service, repository));
  const host = await listen(app); server = host.server; base = host.url;
});

beforeEach(() => {
  quote = { reference: randomUUID(), ticket: "T-123", parking: { id: "parking-external", name: "External parking" },
    amountMinor: 12550, currency: "MXN", expiresAt: Date.now() + 600_000, status: "payable" };
  confirmationFails = false; quoteMode = "ok"; quoteCalls = 0; confirmationCalls = 0; deliveries.clear();
});

afterAll(async () => {
  vi.restoreAllMocks();
  for (const host of [server, providerServer]) if (host) {
    host.closeAllConnections(); await new Promise<void>(resolve => host.close(() => resolve()));
  }
  const orders = await db().externalPaymentOrder.findMany({ where: { usuarioId: { in: [user, otherUser] } }, select: { id: true } });
  await db().operationalIncident.deleteMany({ where: { incidentKey: { in: orders.map(row => `external-payment:${row.id}`) } } });
  await db().externalPaymentEvent.deleteMany({ where: { orderId: { in: orders.map(row => row.id) } } });
  await db().payment.deleteMany({ where: { usuarioId: { in: [user, otherUser] } } });
  await db().externalPaymentOrder.deleteMany({ where: { usuarioId: { in: [user, otherUser] } } });
  await db().proyecto.delete({ where: { id: proyectoId } });
  await db().usuario.deleteMany({ where: { id: { in: [user, otherUser] } } });
  await db().usuario.deleteMany({ where: { id: { in: staff } } });
  if (profileId) await db().permissionProfile.delete({ where: { id: profileId } });
  await PostgresDatabase.disconnect();
});

const resolveOrder = async () => (await service.resolve(user, proyectoId, "opaque-QR-with-no-trusted-amount"));
const paidOrder = async () => {
  const order = await resolveOrder();
  await service.createPaymentIntent(user, order.id);
  await service.acceptSucceeded(stripe.succeed(order.id));
  return order;
};

describe("external payments: PostgreSQL, HTTP provider, authenticated API and Stripe port", () => {
  it("restricts the global administrative queue to super administrators", async () => {
    for (const path of ["/admin-api/orders", `/admin-api/orders/${randomUUID()}/events`]) {
      expect((await request("GET", path, undefined, null)).status).toBe(401);
      expect((await request("GET", path, undefined, token)).status).toBe(403);
      expect((await request("GET", path, undefined, adminToken)).status).toBe(403);
      expect((await request("GET", path, undefined, superToken)).status).toBe(path.endsWith("events") ? 404 : 200);
    }
    const path = `/admin-api/orders/${randomUUID()}/retry-confirmation`;
    expect((await request("POST", path, { reason: "Validar recuperacion" }, token)).status).toBe(403);
    expect((await request("POST", path, { reason: "Validar recuperacion" }, adminToken)).status).toBe(403);
  });

  it("filters and paginates admin orders and events with no client secrets", async () => {
    await resolveOrder(); quote.reference = randomUUID(); await resolveOrder();
    const result = await request("GET", `/admin-api/orders?userId=${user}&status=quoted&provider=seguripass&limit=1`, undefined, superToken);
    expect(result.status).toBe(200); expect(result.body.orders).toHaveLength(1); expect(result.body.total).toBeGreaterThanOrEqual(2);
    expect(result.body.orders[0]).not.toHaveProperty("clientSecret"); expect(result.body.orders[0]).not.toHaveProperty("leaseOwner");
    const events = await request("GET", `/admin-api/orders/${result.body.orders[0].id}/events?limit=1`, undefined, superToken);
    expect(events.body.events[0].kind).toBe("quoted");
    for (const query of ["status=bad", "page=1.5", "limit=101", "userId=bad", "provider=a%2Fb", "from=999999999999999999", "from=100&to=1", "status=paid&status=quoted"]) {
      expect((await request("GET", `/admin-api/orders?${query}`, undefined, superToken)).status).toBe(400);
    }
    expect((await request("GET", "/admin-api/orders/invalid/events", undefined, superToken)).status).toBe(400);
  });

  it("audits a concurrent manual retry and preserves the existing charge and incident until confirmation", async () => {
    const order = await paidOrder();
    await db().externalPaymentOrder.update({ where: { id: order.id }, data: { attempts: 7 } });
    confirmationFails = true; await service.runOnce();
    expect((await repository.find(order.id))?.status).toBe("confirmation_failed");
    const creates = stripe.creates;
    const path = `/admin-api/orders/${order.id}/retry-confirmation`;
    expect((await request("POST", path, { reason: "corto" }, superToken)).status).toBe(400);
    const results = await Promise.all([request("POST", path, { reason: "Proveedor recuperado tras incidente" }, superToken), request("POST", path, { reason: "Proveedor recuperado tras incidente" }, superToken)]);
    expect(results.map(result => result.status).sort()).toEqual([202, 409]);
    const audit = await db().externalPaymentEvent.findMany({ where: { orderId: order.id, kind: "manual_confirmation_retry" } });
    expect(audit).toHaveLength(1); expect(JSON.parse(audit[0].detail)).toMatchObject({ actorId: staff[0], previousAttempts: 8 });
    expect((await repository.find(order.id))?.attempts).toBe(0);
    expect(await db().operationalIncident.findUnique({ where: { incidentKey: `external-payment:${order.id}` } })).toMatchObject({ status: "open" });
    confirmationFails = false; await service.runOnce();
    expect((await repository.find(order.id))?.status).toBe("confirmed");
    expect(await db().operationalIncident.findUnique({ where: { incidentKey: `external-payment:${order.id}` } })).toMatchObject({ status: "resolved" });
    expect(stripe.creates).toBe(creates);
    expect((await request("POST", path, { reason: "No debe repetir confirmacion" }, superToken)).status).toBe(409);
  });

  it("rejects manual retries for unpaid, refunded, mismatched or actively leased payments", async () => {
    const order = await paidOrder();
    await db().externalPaymentOrder.update({ where: { id: order.id }, data: { attempts: 7 } });
    confirmationFails = true; await service.runOnce();
    const path = `/admin-api/orders/${order.id}/retry-confirmation`;
    const intent = stripe.intents.get(order.id)!;
    intent.status = "requires_payment_method";
    expect((await request("POST", path, { reason: "Verificar estado financiero" }, superToken)).status).toBe(409);
    intent.status = "succeeded"; intent.amountMinor = 1;
    expect((await request("POST", path, { reason: "Verificar estado financiero" }, superToken)).status).toBe(409);
    intent.amountMinor = 12550;
    await db().payment.updateMany({ where: { referenceId: order.id }, data: { status: "refunded" } });
    expect((await request("POST", path, { reason: "Verificar estado financiero" }, superToken)).status).toBe(409);
    await db().payment.updateMany({ where: { referenceId: order.id }, data: { status: "succeeded" } });
    await db().externalPaymentOrder.update({ where: { id: order.id }, data: { leaseUntil: new Date(Date.now() + 60_000) } });
    expect((await request("POST", path, { reason: "Verificar estado financiero" }, superToken)).status).toBe(409);
    expect(await db().externalPaymentEvent.count({ where: { orderId: order.id, kind: "manual_confirmation_retry" } })).toBe(0);
  });
  it("requires auth and owns orders; ignores client amounts and user IDs", async () => {
    expect((await request("POST", "/orders-api/orders", {}, null)).status).toBe(401);
    const result = await request("POST", "/orders-api/orders", { projectId: proyectoId, qr: "untrusted", amountMinor: 1, userId: otherUser });
    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({ amountMinor: 12550, currency: "MXN", parking: quote.parking, proyectoId });
    expect((await request("GET", `/orders-api/orders/${result.body.id}`, undefined, otherToken)).status).toBe(404);
    expect((await request("POST", `/orders-api/orders/${result.body.id}/payment-intent`, {}, otherToken)).status).toBe(404);
    expect((await request("GET", "/orders-api/orders/not-an-id")).status).toBe(400);
    const wrongApp = String(await JwtPlugin.generateToken({ id: user, app: "OPERATIVE_WEB" }));
    expect((await request("GET", `/orders-api/orders/${result.body.id}`, undefined, wrongApp)).status).toBe(403);
  });

  it("deduplicates QR and concurrent payment creation, freezing the first quote", async () => {
    const before = stripe.creates;
    const orders = await Promise.all(Array.from({ length: 5 }, () => resolveOrder()));
    expect(new Set(orders.map(value => value.id)).size).toBe(1);
    const id = orders[0].id;
    quote.amountMinor = 18000;
    expect((await resolveOrder()).amountMinor).toBe(12550);
    const intents = await Promise.all(Array.from({ length: 5 }, () => service.createPaymentIntent(user, id)));
    expect(new Set(intents.map(value => value.paymentIntentId)).size).toBe(1);
    expect(stripe.creates - before).toBe(1);
    expect(await db().payment.count({ where: { referenceId: id } })).toBe(1);
    // Another account scanning the same ticket gets a clear conflict, not a missing order.
    await expect(service.resolve(otherUser, proyectoId, "same-qr")).rejects.toMatchObject({ statusCode: 409, code: "EXTERNAL_ORDER_TAKEN" });
  });

  it("quotes a ticket again once its unpaid quote expires, with the provider's current amount", async () => {
    const first = await resolveOrder();
    await db().externalPaymentOrder.update({ where: { id: first.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    quote.amountMinor = 18000;

    const second = await resolveOrder();
    expect(second.id).not.toBe(first.id);
    expect(second).toMatchObject({ amountMinor: 18000, status: "quoted" });
    expect((await repository.find(first.id))?.status).toBe("expired");
    // The new quote can be paid; the expired one cannot.
    expect((await service.createPaymentIntent(user, second.id)).status).toBe("requires_payment_method");
    await expect(service.createPaymentIntent(user, first.id)).rejects.toMatchObject({ statusCode: 409 });

    // Once expired, another account may take the ticket too.
    await db().externalPaymentOrder.update({ where: { id: second.id }, data: { status: "expired" } });
    const third = await service.resolve(otherUser, proyectoId, "same-qr");
    expect(third.id).not.toBe(second.id);
  });

  it("keeps an order with a charge in progress even after its quote expires", async () => {
    const order = await resolveOrder();
    await service.createPaymentIntent(user, order.id);
    await db().externalPaymentOrder.update({ where: { id: order.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    // Not replaced: the worker cancels the Stripe intent first, then the reference is free.
    await expect(resolveOrder()).rejects.toMatchObject({ statusCode: 409 });
    expect(await db().externalPaymentOrder.count({ where: { reference: quote.reference } })).toBe(1);
    await service.runOnce();
    expect((await resolveOrder()).id).not.toBe(order.id);
  });

  it("recovers an ambiguous Stripe creation using the same canonical order", async () => {
    const order = await resolveOrder();
    const before = stripe.creates;
    stripe.loseResponse = true;
    await expect(service.createPaymentIntent(user, order.id)).rejects.toThrow("lost Stripe response");
    expect((await repository.find(order.id))?.stripePaymentIntentId).toBeNull();
    await service.runOnce();
    expect((await repository.find(order.id))?.stripePaymentIntentId).toBe(stripe.intents.get(order.id)?.id);
    expect(stripe.creates - before).toBe(1);
  });

  it("refuses to recreate an unknown Stripe intent after the idempotency recovery window", async () => {
    const order = await resolveOrder();
    await repository.beginIntent(order.id, Date.now());
    await db().externalPaymentOrder.update({ where: { id: order.id }, data: { intentStartedAt: new Date(Date.now() - 24 * 3600_000) } });
    const before = stripe.creates;
    await expect(service.createPaymentIntent(user, order.id)).rejects.toMatchObject({ code: "STRIPE_INTENT_RECOVERY_WINDOW_EXCEEDED" });
    expect(stripe.creates).toBe(before);
    expect(await db().operationalIncident.findUnique({ where: { incidentKey: `external-payment:${order.id}` } })).toMatchObject({ status: "open" });
    // Keep the unrelated reconciliation cases in this file independent.
    await db().externalPaymentOrder.update({ where: { id: order.id }, data: { nextRetryAt: new Date(Date.now() + 86400_000) } });
  });

  it("never confirms before Stripe succeeds; rejects mismatched amount/currency/user", async () => {
    const order = await resolveOrder();
    await service.createPaymentIntent(user, order.id);
    const intent = stripe.intents.get(order.id)!;
    await expect(service.acceptSucceeded(intent)).rejects.toMatchObject({ statusCode: 409 });
    for (const invalid of [{ amountMinor: 1 }, { currency: "USD" }, { userId: otherUser }, { id: "pi_other" }]) {
      await expect(service.acceptSucceeded({ ...intent, status: "succeeded", ...invalid })).rejects.toMatchObject({ statusCode: 409 });
    }
    await service.runOnce();
    expect(confirmationCalls).toBe(0);
    expect((await repository.find(order.id))?.status).toBe("payment_pending");
  });

  it("handles a successful webhook arriving before intent attachment commits", async () => {
    const order = await resolveOrder();
    await repository.beginIntent(order.id, Date.now());
    await stripe.create((await repository.find(order.id))!);
    const intent = stripe.succeed(order.id);
    await service.acceptSucceeded(intent);
    await repository.attachIntent((await repository.find(order.id))!, intent);
    await service.runOnce();
    expect((await repository.find(order.id))?.status).toBe("confirmed");
    expect(await db().payment.count({ where: { referenceId: order.id } })).toBe(1);
  });

  it("recovers a missing webhook and excludes external payments from pension/ticket reconciliation", async () => {
    const order = await resolveOrder();
    await service.createPaymentIntent(user, order.id);
    stripe.succeed(order.id);
    await service.runOnce();
    expect((await repository.find(order.id))?.status).toBe("confirmed");
    const history = await new PaymentPostgresDatasource().getSerializedByUser(user, { page: 1, limit: 100 });
    expect(history.payments.find(value => (value.reference as { id: string }).id === order.id)).toMatchObject({ type: "external", status: "succeeded", amount: 125.5, reconciliationStatus: "reconciled" });
    expect((await new PaymentPostgresDatasource().findPendingReconciliation(100)).some(value => value.type === "external")).toBe(false);
  });

  it("uses a per-order lease and stable confirmation key after a provider timeout", async () => {
    const order = await paidOrder();
    confirmationFails = true;
    await service.runOnce();
    expect((await repository.find(order.id))?.status).toBe("paid");
    const key = [...deliveries][0];
    await db().externalPaymentOrder.update({ where: { id: order.id }, data: { nextRetryAt: new Date(0) } });
    confirmationFails = false;
    await Promise.all([service.runOnce(), service.runOnce()]);
    expect(confirmationCalls).toBe(2);
    expect([...deliveries]).toEqual([key]);
    expect((await repository.find(order.id))?.status).toBe("confirmed");
    await service.acceptSucceeded(stripe.succeed(order.id));
    await service.runOnce();
    expect(confirmationCalls).toBe(2);
    expect(await db().externalPaymentEvent.count({ where: { orderId: order.id, kind: "paid" } })).toBe(1);
  });

  it("sends exhausted confirmations to review without charging or refunding automatically", async () => {
    const order = await paidOrder();
    confirmationFails = true;
    const before = stripe.creates;
    for (let index = 0; index < 8; index++) {
      await db().externalPaymentOrder.update({ where: { id: order.id }, data: { nextRetryAt: new Date(0) } });
      await service.runOnce();
    }
    expect((await repository.find(order.id))?.status).toBe("confirmation_failed");
    expect(await db().operationalIncident.findUnique({ where: { incidentKey: `external-payment:${order.id}` } })).toMatchObject({ type: "EXTERNAL_PAYMENT_REVIEW", status: "open" });
    expect(await db().payment.findFirst({ where: { referenceId: order.id } })).toMatchObject({ status: "succeeded", reconciliationStatus: "failed" });
    await service.acceptSucceeded(stripe.succeed(order.id));
    expect((await repository.find(order.id))?.status).toBe("confirmation_failed");
    expect(stripe.creates).toBe(before);
  });

  it("reclaims stale leases and fences out the old worker", async () => {
    const order = await paidOrder();
    expect(await repository.claimConfirmation(order.id, "old", Date.now())).not.toBeNull();
    expect(await repository.claimConfirmation(order.id, "new", Date.now())).toBeNull();
    await db().externalPaymentOrder.update({ where: { id: order.id }, data: { leaseUntil: new Date(0) } });
    expect(await repository.claimConfirmation(order.id, "new", Date.now())).not.toBeNull();
    await repository.confirmed(order.id, "old", "wrong-worker", Date.now());
    expect((await repository.find(order.id))?.status).toBe("paid");
    await repository.confirmed(order.id, "new", "correct-worker", Date.now());
    expect((await repository.find(order.id))?.confirmationReference).toBe("correct-worker");
  });

  it("expires unpaid orders only after canceling Stripe", async () => {
    const order = await resolveOrder();
    await service.createPaymentIntent(user, order.id);
    await db().externalPaymentOrder.update({ where: { id: order.id }, data: { expiresAt: new Date(0) } });
    await expect(service.createPaymentIntent(user, order.id)).rejects.toMatchObject({ statusCode: 409 });
    await service.runOnce();
    expect((await repository.find(order.id))?.status).toBe("expired");
    expect(stripe.intents.get(order.id)?.status).toBe("canceled");
    expect(confirmationCalls).toBe(0);
  });

  it("preserves a payment that succeeds while expiration attempts cancellation", async () => {
    const order = await resolveOrder();
    await service.createPaymentIntent(user, order.id);
    await db().externalPaymentOrder.update({ where: { id: order.id }, data: { expiresAt: new Date(0) } });
    const cancellation = vi.spyOn(stripe, "cancel").mockImplementationOnce(async () => stripe.succeed(order.id));
    try {
      await service.runOnce();
      expect((await repository.find(order.id))?.status).toBe("confirmed");
      expect(await db().payment.findFirst({ where: { referenceId: order.id } })).toMatchObject({ status: "succeeded" });
    } finally { cancellation.mockRestore(); }
  });

  it("sets the stable Stripe key and metadata in the actual gateway; runtime never silently mocks", async () => {
    const order = await resolveOrder();
    const original = { key: envs.SECRET_STRIPE_KEY, enabled: envs.STRIPE_ENABLED, mock: envs.STRIPE_MOCK_ENABLED };
    envs.SECRET_STRIPE_KEY = "sk_test_not_real"; envs.STRIPE_ENABLED = true; envs.STRIPE_MOCK_ENABLED = false;
    const create = vi.spyOn(StripePlugin.client.paymentIntents, "create").mockResolvedValue({
      id: "pi_gateway_test", client_secret: "test-secret", amount: 12550, currency: "mxn", status: "requires_payment_method",
      metadata: { externalOrderId: order.id, usuario: user, type: "external" },
    } as never);
    try {
      const gateway = new StripeExternalGateway();
      await gateway.create((await repository.find(order.id))!);
      expect(create).toHaveBeenCalledWith(expect.objectContaining({
        amount: 12550, currency: "mxn", metadata: { type: "external", externalOrderId: order.id, usuario: user, provider: "seguripass" },
      }), { idempotencyKey: `external-intent:${order.id}` });
      envs.STRIPE_MOCK_ENABLED = true;
      await expect(gateway.create((await repository.find(order.id))!)).rejects.toMatchObject({ code: "EXTERNAL_STRIPE_DISABLED" });
    } finally {
      create.mockRestore();
      envs.SECRET_STRIPE_KEY = original.key; envs.STRIPE_ENABLED = original.enabled; envs.STRIPE_MOCK_ENABLED = original.mock;
    }
  });

  it("processes signature-verified duplicate webhooks without resetting confirmation", async () => {
    const order = await resolveOrder();
    await service.createPaymentIntent(user, order.id);
    const intent = stripe.succeed(order.id);
    const previousSecret = envs.STRIPE_WEBHOOK_SECRET;
    const previousKey = envs.SECRET_STRIPE_KEY;
    envs.STRIPE_WEBHOOK_SECRET = "whsec_test"; envs.SECRET_STRIPE_KEY = "sk_test_not_real";
    const payload = JSON.stringify({ id: "evt_test", object: "event", type: "payment_intent.succeeded", data: { object: {
      id: intent.id, amount: intent.amountMinor, currency: "mxn", status: "succeeded", client_secret: null,
      metadata: { type: "external", externalOrderId: order.id, usuario: user },
    } } });
    try {
      const signature = StripePlugin.client.webhooks.generateTestHeaderString({ payload, secret: "whsec_test" });
      const send = (sig: string) => fetch(base + "/webhook", { method: "POST", headers: { "Content-Type": "application/json", "stripe-signature": sig }, body: payload });
      expect((await send("invalid")).status).toBe(400);
      expect((await repository.find(order.id))?.status).toBe("payment_pending");
      expect((await send(signature)).status).toBe(200);
      await service.runOnce();
      expect((await send(signature)).status).toBe(200);
      expect((await repository.find(order.id))?.status).toBe("confirmed");
      expect(await db().externalPaymentEvent.count({ where: { orderId: order.id, kind: "paid" } })).toBe(1);

      // An order this database does not know (another environment on the same Stripe
      // account) is acknowledged, so Stripe does not retry it for days.
      for (const externalOrderId of [randomUUID(), "not-an-order-id"]) {
        const foreign = JSON.stringify({ id: "evt_foreign", object: "event", type: "payment_intent.succeeded", data: { object: {
          id: `pi_foreign_${randomUUID()}`, amount: 12550, currency: "mxn", status: "succeeded", client_secret: null,
          metadata: { type: "external", externalOrderId, usuario: user },
        } } });
        const response = await fetch(base + "/webhook", { method: "POST", headers: { "Content-Type": "application/json",
          "stripe-signature": StripePlugin.client.webhooks.generateTestHeaderString({ payload: foreign, secret: "whsec_test" }) }, body: foreign });
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ ignored: true });
      }
      // A known order whose charge does not match is still an error (Stripe keeps retrying).
      const mismatched = JSON.stringify({ id: "evt_mismatch", object: "event", type: "payment_intent.succeeded", data: { object: {
        id: intent.id, amount: 1, currency: "mxn", status: "succeeded", client_secret: null,
        metadata: { type: "external", externalOrderId: order.id, usuario: user },
      } } });
      expect((await fetch(base + "/webhook", { method: "POST", headers: { "Content-Type": "application/json",
        "stripe-signature": StripePlugin.client.webhooks.generateTestHeaderString({ payload: mismatched, secret: "whsec_test" }) }, body: mismatched })).status).toBe(400);
    } finally { envs.STRIPE_WEBHOOK_SECRET = previousSecret; envs.SECRET_STRIPE_KEY = previousKey; }
  });

  it("rejects invalid quotes, unavailable provider, timeouts and unknown protocols", async () => {
    await expect(new HttpProviderClient("sin-configurar").resolveOrder("qr", "parking")).rejects.toMatchObject({ statusCode: 503, code: "EXTERNAL_PROVIDER_NOT_CONFIGURED" });
    await expect(service.resolve(user, "unknown", "qr")).rejects.toMatchObject({ statusCode: 400 });
    await expect(service.resolve(user, proyectoId, "")).rejects.toMatchObject({ statusCode: 400 });
    // A parking without an external provider cannot quote.
    await expect(service.resolve(user, randomUUID(), "qr")).rejects.toMatchObject({ statusCode: 409, code: "PARKING_WITHOUT_PROVIDER" });
    quote.status = "paid";
    await expect(resolveOrder()).rejects.toMatchObject({ statusCode: 409 });
    quote.status = "payable"; quote.expiresAt = Date.now() - 1;
    await expect(resolveOrder()).rejects.toMatchObject({ statusCode: 409 });
    quote.expiresAt = Date.now() + 60000; quote.amountMinor = 1.2;
    await expect(resolveOrder()).rejects.toMatchObject({ statusCode: 502 });
    quoteMode = "missing";
    await expect(resolveOrder()).rejects.toMatchObject({ statusCode: 409 });
    quoteMode = "invalid";
    await expect(resolveOrder()).rejects.toMatchObject({ statusCode: 502 });
    quoteMode = "null";
    await expect(resolveOrder()).rejects.toMatchObject({ statusCode: 502 });
    quoteMode = "unavailable"; quoteCalls = 0;
    await expect(resolveOrder()).rejects.toMatchObject({ statusCode: 503 });
    expect(quoteCalls).toBe(3);
    quoteMode = "timeout";
    await expect(resolveOrder()).rejects.toMatchObject({ statusCode: 503 });
  });
});
