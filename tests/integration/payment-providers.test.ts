import express from "express";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresDatabase } from "../../src/data/postgres";
import { Prisma } from "../../src/generated/prisma/client";
import { ExternalPaymentService } from "../../src/domain/external-payments/external-payment.service";
import type { ExternalIntent, ExternalOrder, ExternalPaymentGateway } from "../../src/domain/external-payments/external-payment";
import { PaymentProviderPostgresDatasource } from "../../src/infrastructure/datasources/parking/payment-provider.datasource.postgres";
import { PostgresExternalProviderDirectory } from "../../src/infrastructure/external-payments/provider-directory.postgres";
import { PaymentProviderRepositoryImpl } from "../../src/infrastructure/repositories/parking/payment-provider.repository.impl";
import { ExternalOrderPostgresRepository } from "../../src/infrastructure/repositories/payments/external-order.repository.postgres";
import { PaymentProviderService } from "../../src/presentation/services/parking/payment-provider.service";
import { createProviderReferenceApp } from "../../scripts/provider-reference-server";

/** Stripe stand-in: one intent per order, succeeded on demand. */
class FakeStripe implements ExternalPaymentGateway {
  intents = new Map<string, ExternalIntent>();
  async create(order: ExternalOrder) {
    if (!this.intents.has(order.id)) {
      this.intents.set(order.id, { id: `pi_${order.id}`, orderId: order.id, userId: order.userId,
        amountMinor: order.amountMinor, currency: order.currency, clientSecret: "secret", status: "requires_payment_method" });
    }
    return { ...this.intents.get(order.id)! };
  }
  async retrieve(id: string) { return { ...[...this.intents.values()].find((intent) => intent.id === id)! }; }
  async cancel(id: string) { return this.retrieve(id); }
  succeed(orderId: string) { const intent = this.intents.get(orderId)!; intent.status = "succeeded"; return { ...intent }; }
}

const db = () => PostgresDatabase.client;
const tag = randomUUID().slice(0, 8);
const catalog = new PaymentProviderService(new PaymentProviderRepositoryImpl(new PaymentProviderPostgresDatasource()), new PostgresExternalProviderDirectory(true), true);
const stripe = new FakeStripe();
const orders = new ExternalOrderPostgresRepository();
const service = new ExternalPaymentService(orders, new PostgresExternalProviderDirectory(true), stripe);
const providerIds: string[] = [];
const projectIds: string[] = [];
let referenceServer: Server;
let referenceUrl = "";
let userId = "";

/** External providers are born inactive; unless `active: false` is asked, this one counts as tested and active. */
const provider = async (overrides: Record<string, unknown>) => {
  const created = await catalog.create({
    nombre: `prov-${tag}-${providerIds.length}`, integration: "standard", adapter: "", baseUrl: referenceUrl,
    credential: "referencia-viggo", active: true, timeoutMs: 2000, authHeader: "", ...overrides,
  });
  providerIds.push(created.id);
  if (created.integration === "viggo" || overrides.active === false) return created;
  await db().paymentProvider.update({ where: { id: created.id }, data: { active: true, verifiedAt: new Date() } });
  return { ...created, active: true };
};

const project = async (paymentProviderId: string, externalParkingId = "plaza-centro") => {
  const id = randomUUID();
  await db().proyecto.create({ data: { id, nombre: `Parking ${tag}`, coordinates: [], ciudad: "GDL", identificador: `${tag}-${id}`, paymentProviderId, externalParkingId } });
  projectIds.push(id);
  return id;
};

beforeAll(async () => {
  await PostgresDatabase.connect({ databaseUrl: process.env.DATABASE_URL!, poolMax: 4 });
  referenceServer = createProviderReferenceApp().listen(0, "127.0.0.1");
  await new Promise((resolve) => referenceServer.once("listening", resolve));
  referenceUrl = `http://127.0.0.1:${(referenceServer.address() as AddressInfo).port}`;
  userId = (await db().usuario.create({ data: { nombre: "App", apellido: "User", password: "hash",
    correo: `${tag}@example.com`, telefono: tag, emailValidated: true, allowedApps: ["OPERATIVE_MOBILE"] } })).id;
});

afterAll(async () => {
  await new Promise((resolve) => referenceServer.close(resolve));
  const orderIds = (await db().externalPaymentOrder.findMany({ where: { usuarioId: userId }, select: { id: true } })).map((row) => row.id);
  await db().operationalIncident.deleteMany({ where: { incidentKey: { in: orderIds.map((id) => `external-payment:${id}`) } } });
  await db().externalPaymentEvent.deleteMany({ where: { orderId: { in: orderIds } } });
  await db().payment.deleteMany({ where: { usuarioId: userId } });
  await db().externalPaymentOrder.deleteMany({ where: { usuarioId: userId } });
  await db().proyecto.deleteMany({ where: { id: { in: projectIds } } });
  await db().paymentProvider.deleteMany({ where: { id: { in: providerIds } } });
  await db().usuario.delete({ where: { id: userId } });
  await PostgresDatabase.disconnect();
});

describe("payment provider catalog", () => {
  it("validates the configuration and never exposes the credential", async () => {
    const viggo = await provider({ integration: "viggo", baseUrl: "", credential: undefined });
    expect(viggo).toMatchObject({ integration: "viggo", hasCredential: false, active: true });

    await expect(provider({ credential: undefined })).rejects.toThrow("credential");
    await expect(provider({ baseUrl: "http://proveedor.example.com" })).rejects.toThrow("HTTPS");
    await expect(provider({ integration: "adapter", adapter: "desconocido" })).rejects.toThrow("adapter");
    await expect(provider({ timeoutMs: 50 })).rejects.toThrow("timeoutMs");
    // The client sets these headers itself: the credential cannot go in them.
    await expect(provider({ authHeader: "Idempotency-Key" })).rejects.toThrow("authHeader");
    await expect(provider({ authHeader: "X API Key" })).rejects.toThrow("authHeader");

    const standard = await provider({});
    expect(standard).toMatchObject({ integration: "standard", baseUrl: referenceUrl, hasCredential: true });
    expect(JSON.stringify(standard)).not.toContain("referencia-viggo");
    const row = await db().paymentProvider.findUniqueOrThrow({ where: { id: standard.id } });
    expect(row.credentialEncrypted).not.toContain("referencia-viggo");

    // An update without a credential keeps the stored one; switching to standard needs a URL.
    expect(await catalog.update(standard.id, { timeoutMs: 3000 })).toMatchObject({ hasCredential: true, timeoutMs: 3000 });
    await expect(catalog.update(viggo.id, { integration: "standard" })).rejects.toThrow("baseUrl");
  });
});

describe("connection test before activating a provider", () => {
  it("is born inactive and is activated only after a successful test", async () => {
    const created = await catalog.create({ nombre: `prov-${tag}-nuevo`, integration: "standard", adapter: "", baseUrl: referenceUrl,
      credential: "referencia-viggo", active: true, timeoutMs: 2000, authHeader: "" });
    providerIds.push(created.id);
    expect(created).toMatchObject({ active: false, verifiedAt: null });
    await expect(catalog.update(created.id, { active: true })).rejects.toMatchObject({ code: "PROVIDER_NOT_VERIFIED" });

    // A ticket from another parking or an unknown QR: what failed, and still not tested.
    expect(await catalog.testConnection(created.id, { qr: "PRV|000123|plaza-centro", parkingId: "otro" })).toMatchObject({ ok: false });
    await expect(catalog.testConnection(created.id, { qr: "", parkingId: "plaza-centro" })).rejects.toMatchObject({ statusCode: 400 });

    const result = await catalog.testConnection(created.id, { qr: "PRV|000123|plaza-centro", parkingId: "plaza-centro" });
    expect(result).toMatchObject({ ok: true, warnings: [], quote: { ticket: "000123", amountMinor: 12550, currency: "MXN", status: "payable" } });
    // A test creates no orders.
    expect(await db().externalPaymentOrder.count({ where: { provider: created.id } })).toBe(0);

    const active = await catalog.update(created.id, { active: true });
    expect(active.active).toBe(true);
    expect(active.verifiedAt).toBeTruthy();

    // Saving the same mapping or other fields keeps it active; a new connection needs a new test.
    expect(await catalog.update(created.id, { timeoutMs: 3000, baseUrl: referenceUrl })).toMatchObject({ active: true });
    expect(await catalog.update(created.id, { credential: "otra-credencial" })).toMatchObject({ active: false, verifiedAt: null });
  });

  it("warns when the ticket cannot be charged and refuses unusable quotes", async () => {
    const created = await provider({ active: false });
    const paid = await catalog.testConnection(created.id, { qr: "PRV|000124|plaza-centro", parkingId: "plaza-centro" });
    expect(paid).toMatchObject({ ok: true, quote: { status: "paid" } });
    expect((paid as { warnings: string[] }).warnings[0]).toContain("pagado");

    const viggo = await provider({ integration: "viggo", baseUrl: "", credential: undefined });
    expect(await catalog.testConnection(viggo.id, { qr: "x", parkingId: "y" })).toMatchObject({ ok: false, code: "VIGGO_TICKET_FLOW" });
  });
});

describe("external payments through a standard provider configured in the catalog", () => {
  it("quotes, charges and confirms against the reference provider", async () => {
    const parking = await project((await provider({})).id);
    const order = await service.resolve(userId, parking, "PRV|000123|plaza-centro");
    expect(order).toMatchObject({ amountMinor: 12550, currency: "MXN", ticket: "000123", proyectoId: parking, status: "quoted" });

    await service.createPaymentIntent(userId, order.id);
    await service.acceptSucceeded(stripe.succeed(order.id));
    await service.runOnce();
    const confirmed = await db().externalPaymentOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(confirmed).toMatchObject({ status: "confirmed", proyectoId: parking });
    expect(confirmed.confirmationReference).toMatch(/^CONF-000123-/);
  });

  it("explains why a parking cannot charge an external order", async () => {
    const viggoParking = await project((await provider({ integration: "viggo", baseUrl: "", credential: undefined })).id);
    await expect(service.resolve(userId, viggoParking, "PRV|000123|plaza-centro")).rejects.toMatchObject({ code: "VIGGO_TICKET_FLOW" });

    const inactiveParking = await project((await provider({ active: false })).id);
    await expect(service.resolve(userId, inactiveParking, "PRV|000123|plaza-centro")).rejects.toMatchObject({ statusCode: 503, code: "PROVIDER_INACTIVE" });

    const badCredential = await project((await provider({ credential: "otra-credencial" })).id);
    await expect(service.resolve(userId, badCredential, "PRV|000123|plaza-centro")).rejects.toMatchObject({ code: "EXTERNAL_PROVIDER_REJECTED" });

    // The QR belongs to another parking of the provider.
    const otherParking = await project((await provider({})).id, "otro");
    await expect(service.resolve(userId, otherParking, "PRV|000123|plaza-centro")).rejects.toMatchObject({ statusCode: 409 });
  });

  it("sends a final provider answer straight to review instead of retrying", async () => {
    // Its own reference provider, with fresh tickets.
    const fresh = createProviderReferenceApp().listen(0, "127.0.0.1");
    await new Promise((resolve) => fresh.once("listening", resolve));
    const baseUrl = `http://127.0.0.1:${(fresh.address() as AddressInfo).port}`;
    try {
      const parking = await project((await provider({ baseUrl })).id);
      const order = await service.resolve(userId, parking, "PRV|000123|plaza-centro");
      await service.createPaymentIntent(userId, order.id);
      await service.acceptSucceeded(stripe.succeed(order.id));

      // Meanwhile the ticket was paid at the provider by other means.
      const other = await fetch(`${baseUrl}/v1/confirmations`, {
        method: "POST",
        headers: { Authorization: "Bearer referencia-viggo", "Content-Type": "application/json", "Idempotency-Key": "pago-en-caseta" },
        body: JSON.stringify({ reference: "TCK-000123", paymentReference: "efectivo", amountMinor: 12550, currency: "MXN" }),
      });
      expect(other.status).toBe(200);

      await service.runOnce();
      const row = await db().externalPaymentOrder.findUniqueOrThrow({ where: { id: order.id } });
      // 409 TICKET_ALREADY_PAID: review (refund) on the first attempt, not 8 retries.
      expect(row).toMatchObject({ status: "confirmation_failed", attempts: 1 });
      expect(await db().operationalIncident.count({ where: { incidentKey: `external-payment:${order.id}`, status: "open" } })).toBe(1);

      // A ticket already paid at the provider cannot be quoted.
      await expect(service.resolve(userId, parking, "PRV|000124|plaza-centro")).rejects.toMatchObject({ statusCode: 409 });
    } finally {
      await new Promise((resolve) => fresh.close(resolve));
    }
  });

  it("sends the credential in the header the provider asks for", async () => {
    // A provider whose API expects X-API-Key instead of a Bearer token.
    const received: Array<Record<string, string | string[] | undefined>> = [];
    const app = express();
    app.use(express.json());
    app.post("/v1/quotes", (req, res) => {
      received.push(req.headers);
      res.json({ reference: `REF-${randomUUID()}`, ticket: "777", parking: { id: "p", name: "Con llave" }, amountMinor: 3000,
        currency: "MXN", expiresAt: new Date(Date.now() + 600_000).toISOString(), status: "payable" });
    });
    const keyServer = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => keyServer.once("listening", resolve));
    try {
      const baseUrl = `http://127.0.0.1:${(keyServer.address() as AddressInfo).port}`;
      const parking = await project((await provider({ baseUrl, credential: "llave-secreta", authHeader: "X-API-Key" })).id, "p");
      expect(await service.resolve(userId, parking, "QR-CON-LLAVE")).toMatchObject({ amountMinor: 3000, proyectoId: parking });
      expect(received[0]["x-api-key"]).toBe("llave-secreta");
      expect(received[0].authorization).toBeUndefined();
    } finally {
      await new Promise((resolve) => keyServer.close(resolve));
    }
  });
});

/** A provider with its own API (Spanish fields, GET quote, PUT confirmation, pesos as text). */
const MAPPING = {
  quote: {
    method: "GET",
    path: "boletos/{qr}?estacionamiento={parkingId}",
    response: {
      reference: "data.folio", ticket: "data.boleto.numero", parkingName: "data.plaza",
      amount: "data.importe", amountUnit: "pesos", currency: "data.moneda",
      expiresAt: "data.vence", expiresFormat: "unixSeconds",
      status: "data.estatus", statusValues: { PENDIENTE: "payable", PAGADO: "paid", VENCIDO: "expired" },
    },
  },
  confirm: {
    method: "PUT",
    path: "boletos/{reference}/pago",
    body: { monto: "{amount}", referenciaPago: "{paymentReference}", nota: "viggo-{idempotencyKey}" },
    idempotencyHeader: "X-Clave-Unica",
    response: { confirmationReference: "resultado.comprobante" },
  },
};

describe("external payments through a configurable adapter", () => {
  let server: Server;
  let baseUrl = "";
  const seen: Array<{ method: string; url: string; headers: Record<string, unknown>; body: unknown }> = [];
  const paid = new Set<string>();

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { seen.push({ method: req.method, url: req.originalUrl, headers: req.headers, body: req.body }); next(); });
    app.get("/api/boletos/:qr", (req, res) => {
      if (req.header("x-api-key") !== "llave-adaptador") return res.sendStatus(401);
      if (req.params.qr === "NO-EXISTE") return res.sendStatus(404);
      const folio = `F-${req.params.qr}`;
      res.json({ data: { folio, boleto: { numero: 456 }, plaza: "Plaza Sur", importe: "85.50", moneda: "mxn",
        vence: Math.floor(Date.now() / 1000) + 600, estatus: paid.has(folio) ? "PAGADO" : "PENDIENTE" } });
    });
    app.put("/api/boletos/:folio/pago", (req, res) => {
      paid.add(req.params.folio);
      res.json({ resultado: { comprobante: `C-${req.params.folio}` } });
    });
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  });

  afterAll(async () => { await new Promise((resolve) => server.close(resolve)); });

  const adapter = (overrides: Record<string, unknown> = {}) =>
    provider({ integration: "adapter", baseUrl, credential: "llave-adaptador", authHeader: "X-API-Key", apiMapping: MAPPING, ...overrides });

  it("validates the mapping", async () => {
    const quote = (changes: Record<string, unknown>) => ({ ...MAPPING, quote: { ...MAPPING.quote, ...changes } });
    await expect(adapter({ apiMapping: null })).rejects.toThrow("apiMapping");
    await expect(adapter({ adapter: "seguripass" })).rejects.toThrow("adapter");
    await expect(adapter({ apiMapping: quote({ path: "boletos/{folio}" }) })).rejects.toThrow("{folio}");
    await expect(adapter({ apiMapping: quote({ path: "../admin/{qr}" }) })).rejects.toThrow("'..'");
    await expect(adapter({ apiMapping: quote({ path: "/boletos/{qr}" }) })).rejects.toThrow("quote.path");
    await expect(adapter({ apiMapping: quote({ path: "https://otro.example.com/{qr}" }) })).rejects.toThrow("quote.path");
    await expect(adapter({ apiMapping: quote({ body: { qr: "{qr}" } }) })).rejects.toThrow("GET");
    await expect(adapter({ apiMapping: quote({ response: { ...MAPPING.quote.response, amount: "data.__proto__" } }) })).rejects.toThrow("amount");
    await expect(adapter({ apiMapping: quote({ response: { ...MAPPING.quote.response, statusValues: { PAGADO: "paid" } } }) })).rejects.toThrow("payable");
    await expect(adapter({ apiMapping: { ...MAPPING, confirm: { ...MAPPING.confirm, idempotencyHeader: "X-API-Key" } } })).rejects.toThrow("idempotencyHeader");

    const created = await adapter();
    expect(created).toMatchObject({ integration: "adapter", adapter: "", apiMapping: MAPPING });
    // An update that does not send the mapping keeps it; sending it again (keys reordered by JSONB) is no change.
    expect(await catalog.update(created.id, { timeoutMs: 3000 })).toMatchObject({ apiMapping: MAPPING, active: true });
    expect(await catalog.update(created.id, { apiMapping: JSON.parse(JSON.stringify(MAPPING)) })).toMatchObject({ active: true });
  });

  it("quotes, charges and confirms speaking the provider's own API", async () => {
    const parking = await project((await adapter()).id, "sur-01");
    seen.length = 0;
    const order = await service.resolve(userId, parking, "QR-777");
    expect(order).toMatchObject({ amountMinor: 8550, currency: "MXN", ticket: "456", status: "quoted" });
    expect(seen[0]).toMatchObject({ method: "GET", url: "/api/boletos/QR-777?estacionamiento=sur-01" });
    expect(seen[0].headers["content-type"]).toBeUndefined();

    await service.createPaymentIntent(userId, order.id);
    await service.acceptSucceeded(stripe.succeed(order.id));
    await service.runOnce();
    const confirmed = await db().externalPaymentOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(confirmed).toMatchObject({ status: "confirmed", confirmationReference: "C-F-QR-777", parkingName: "Plaza Sur" });
    const confirmation = seen.find((request) => request.method === "PUT")!;
    expect(confirmation.url).toBe("/api/boletos/F-QR-777/pago");
    expect(confirmation.body).toMatchObject({ monto: 85.5, referenciaPago: `pi_${order.id}` });
    expect(confirmation.headers["x-clave-unica"]).toBeTruthy();
    expect((confirmation.body as { nota: string }).nota).toBe(`viggo-${confirmation.headers["x-clave-unica"]}`);

    // Its "PAGADO" is translated to paid: it cannot be quoted again.
    await expect(service.resolve(userId, parking, "QR-777")).rejects.toMatchObject({ statusCode: 409 });
  });

  it("keeps the QR from altering the provider's path", async () => {
    const parking = await project((await adapter()).id, "sur-01");
    seen.length = 0;
    await service.resolve(userId, parking, "../../admin?x=1#y").catch(() => undefined);
    expect(seen[0].url).toBe("/api/boletos/..%2F..%2Fadmin%3Fx%3D1%23y?estacionamiento=sur-01");
    await expect(service.resolve(userId, parking, "..")).rejects.toMatchObject({ statusCode: 400 });
    await expect(service.resolve(userId, parking, "NO-EXISTE")).rejects.toMatchObject({ statusCode: 409 });
  });

  it("answers an invalid response and a missing mapping clearly", async () => {
    const wrongAmount = { ...MAPPING, quote: { ...MAPPING.quote, response: { ...MAPPING.quote.response, amount: "data.boleto" } } };
    const parking = await project((await adapter({ apiMapping: wrongAmount })).id, "sur-01");
    await expect(service.resolve(userId, parking, "QR-1")).rejects.toMatchObject({ code: "INVALID_EXTERNAL_RESPONSE" });

    // A provider switched to adapter before its mapping existed (or the old SeguriPass row).
    const legacy = await adapter();
    await db().paymentProvider.update({ where: { id: legacy.id }, data: { apiMapping: Prisma.DbNull } });
    const legacyParking = await project(legacy.id, "sur-01");
    await expect(service.resolve(userId, legacyParking, "QR-1")).rejects.toMatchObject({ statusCode: 503, code: "EXTERNAL_PROVIDER_NOT_CONFIGURED" });
  });
});
