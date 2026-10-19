import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresDatabase } from "../../src/data/postgres";
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
const catalog = new PaymentProviderService(new PaymentProviderRepositoryImpl(new PaymentProviderPostgresDatasource()), true);
const stripe = new FakeStripe();
const orders = new ExternalOrderPostgresRepository();
const service = new ExternalPaymentService(orders, new PostgresExternalProviderDirectory(true), stripe);
const providerIds: string[] = [];
const projectIds: string[] = [];
let referenceServer: Server;
let referenceUrl = "";
let userId = "";

const provider = async (overrides: Record<string, unknown>) => {
  const created = await catalog.create({
    nombre: `prov-${tag}-${providerIds.length}`, integration: "standard", adapter: "", baseUrl: referenceUrl,
    credential: "referencia-viggo", active: true, timeoutMs: 2000, ...overrides,
  });
  providerIds.push(created.id);
  return created;
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
});
