/** Explicit, opt-in Stripe sandbox smoke test. Never accepts a live key or a non-test database. */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { parse } from "dotenv";
import express from "express";
import { spawn, type ChildProcess } from "node:child_process";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

async function main() {
  const key = process.env.STRIPE_TEST_SECRET_KEY ?? "";
  if (!key.startsWith("sk_test_")) throw new Error("STRIPE_TEST_SECRET_KEY must be a Stripe test key");
  const testConfig = parse(readFileSync(".env.test"));
  const databaseUrl = testConfig.DATABASE_URL ?? "";
  if (!new URL(databaseUrl).pathname.endsWith("_test")) throw new Error("A database ending in _test is required");
  Object.assign(process.env, {
    APP_ENV: "test", PROD: "false", DATABASE_URL: databaseUrl,
    JWT_SEED: "external-stripe-validation-test-only-0000",
    SECRET_STRIPE_KEY: key, STRIPE_ENABLED: "true", STRIPE_MOCK_ENABLED: "false",
  });
  const { PostgresDatabase } = await import("../src/data/postgres/index.js");
  const { StripePlugin } = await import("../src/config/plugins/stripe.plugin.js");
  const { StripeExternalGateway, externalIntent } = await import("../src/infrastructure/external-payments/stripe-external.gateway.js");
  const { ExternalOrderPostgresRepository } = await import("../src/infrastructure/repositories/payments/external-order.repository.postgres.js");
  const { ExternalPaymentService } = await import("../src/domain/external-payments/external-payment.service.js");
  const db = await PostgresDatabase.connect({ databaseUrl });
  const orders = new ExternalOrderPostgresRepository();
  const gateway = new StripeExternalGateway();
  const service = new ExternalPaymentService(orders, [], gateway);
  let userId = "", orderId = "", intentId = "";
  const webhookMode = process.argv.includes("--webhook");
  let server: Server | undefined, listener: ChildProcess | undefined;
  let webhookUrl = "", receivedEventId = "", rawEvent: Buffer | undefined, eventSignature = "";
  let successfulDeliveries = 0;
  const waitFor = async (condition: () => boolean, description: string) => {
    const deadline = Date.now() + 45000;
    while (!condition()) {
      if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${description}`);
      await new Promise(done => setTimeout(done, 100));
    }
  };
  try {
    if (webhookMode) {
      const { StripeWebhookController } = await import("../src/presentation/routes/payments/stripe-webhook.controller.js");
      const { buildMobileOperationRepository, buildPaymentRepository } = await import("../src/presentation/dependencies/repositories.dependencies.js");
      const { envs } = await import("../src/config/plugins/envs.plugin.js");
      const controller = new StripeWebhookController(buildPaymentRepository(), buildMobileOperationRepository(), service);
      const app = express();
      app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
        // CLI sees account-wide events. This isolated validator only handles its own PaymentIntent.
        let event: { id: string; data: { object: { id: string } } };
        try { event = JSON.parse(req.body.toString()); }
        catch { return res.sendStatus(400); }
        if (!intentId || event.data?.object?.id !== intentId) return res.status(200).json({ ignored: true });
        const signature = req.header("stripe-signature") ?? "";
        res.once("finish", () => {
          if (res.statusCode === 200) {
            successfulDeliveries++; receivedEventId = event.id; rawEvent = Buffer.from(req.body); eventSignature = signature;
          }
        });
        return controller.handle(req, res);
      });
      server = app.listen(0, "127.0.0.1");
      await new Promise<void>(done => server!.once("listening", done));
      webhookUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/stripe/webhook`;
      const cli = process.env.STRIPE_CLI_PATH ?? "stripe";
      listener = spawn(cli, ["listen", "--skip-update", "--events", "payment_intent.succeeded", "--events-from", "@self", "--forward-to", webhookUrl], {
        env: { ...process.env, STRIPE_API_KEY: key }, stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
      });
      let ready = false, listenerFailed = false, output = "";
      const capture = (chunk: Buffer) => {
        output = (output + chunk.toString()).slice(-4096);
        const secret = output.match(/whsec_[A-Za-z0-9]+/);
        if (secret) { envs.STRIPE_WEBHOOK_SECRET = secret[0]; ready = true; }
      };
      listener.stdout?.on("data", capture); listener.stderr?.on("data", capture);
      listener.on("error", () => { listenerFailed = true; }); listener.on("exit", () => { listenerFailed = true; });
      await waitFor(() => ready || listenerFailed, "Stripe CLI readiness");
      if (!ready || listenerFailed) throw new Error("Stripe CLI could not start");
    }
    const tag = `stripe-validation-${randomUUID()}`;
    const user = await db.usuario.create({ data: {
      nombre: "Stripe", apellido: "Sandbox validation", correo: `${tag}@example.com`, telefono: tag, password: "test-only",
    } });
    userId = user.id;
    const order = await orders.saveQuote(user.id, "seguripass", {
      reference: tag, ticket: "TEST-ONLY", parking: { id: "test-parking", name: "Sandbox validation" },
      amountMinor: 12550, currency: "MXN", expiresAt: Date.now() + 600_000, status: "payable",
    });
    orderId = order.id;
    const first = await service.createPaymentIntent(userId, orderId);
    intentId = first.paymentIntentId;
    const repeated = await service.createPaymentIntent(userId, orderId);
    if (intentId !== repeated.paymentIntentId) throw new Error("Idempotency check failed");
    const confirmed = await StripePlugin.client.paymentIntents.confirm(intentId, {
      payment_method: "pm_card_visa", return_url: "https://example.com/stripe-test-return",
    });
    if (confirmed.livemode || confirmed.status !== "succeeded") throw new Error("Expected a successful test-mode payment");
    const verified = await gateway.retrieve(intentId);
    if (webhookMode) {
      // No direct service call: Stripe CLI must deliver the actual matching signed event.
      await waitFor(() => successfulDeliveries > 0, "real Stripe webhook");
      if (!(await orders.find(orderId)) || (await orders.find(orderId))?.status !== "paid") throw new Error("Webhook did not persist payment");
      const duplicate = await fetch(webhookUrl, { method: "POST", headers: { "Content-Type": "application/json", "stripe-signature": eventSignature }, body: new Uint8Array(rawEvent!) });
      if (duplicate.status !== 200) throw new Error("Duplicate webhook rejected");
      if (await db.externalPaymentEvent.count({ where: { orderId, kind: "paid" } }) !== 1) throw new Error("Webhook duplicated payment audit");
    } else {
      // Recovery path uses a server-side retrieval; it does not pretend a webhook was received.
      await service.acceptSucceeded(verified);
      await service.acceptSucceeded(externalIntent(confirmed));
    }
    const payment = await db.payment.findUnique({ where: { stripePaymentIntentId: intentId } });
    if (payment?.status !== "succeeded" || (await orders.find(orderId))?.status !== "paid") throw new Error("Payment persistence failed");
    if (await db.payment.count({ where: { referenceId: orderId } }) !== 1) throw new Error("Payment duplication detected");
    console.log(JSON.stringify({ testMode: true, paymentIntentId: intentId, status: verified.status,
      amountMinor: verified.amountMinor, currency: verified.currency, idempotent: true, paymentPersisted: true,
      webhookReceived: webhookMode, ...(webhookMode ? { receivedEventId, successfulDeliveries, duplicateWebhookSafe: true } : {}),
      providerConfirmed: false, testRowsWillBeRemoved: true }));
  } finally {
    if (listener?.pid && listener.exitCode === null && listener.signalCode === null) {
      const exited = new Promise<void>(done => listener!.once("exit", () => done())); listener.kill(); await exited;
    }
    if (server) { server.closeAllConnections(); await new Promise<void>(done => server!.close(() => done())); }
    try {
      if (intentId) {
        const intent = await StripePlugin.client.paymentIntents.retrieve(intentId);
        if (!["succeeded", "canceled"].includes(intent.status)) await StripePlugin.client.paymentIntents.cancel(intentId);
      }
    } finally {
      try {
        if (orderId) {
          await db.externalPaymentEvent.deleteMany({ where: { orderId } });
          await db.payment.deleteMany({ where: { referenceId: orderId } });
          await db.externalPaymentOrder.delete({ where: { id: orderId } });
        }
        if (userId) await db.usuario.delete({ where: { id: userId } });
      } finally { await PostgresDatabase.disconnect(); }
    }
  }
}

main().catch(error => {
  // Never print SDK errors containing request bodies, credentials or client secrets.
  console.error(JSON.stringify({ success: false, errorType: error instanceof Error ? error.name : "UnknownError",
    code: error && typeof error === "object" && "code" in error ? String(error.code) : "VALIDATION_FAILED" }));
  process.exitCode = 1;
});
