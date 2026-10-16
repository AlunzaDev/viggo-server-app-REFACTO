import express from "express";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresDatabase } from "../../src/data/postgres";
import type { ExternalIntent } from "../../src/domain/external-payments/external-payment";
import { ExternalOrderPostgresRepository } from "../../src/infrastructure/repositories/payments/external-order.repository.postgres";

const repository = new ExternalOrderPostgresRepository();
const intents = new Map<string, ExternalIntent>();
const deliveries = new Set<string>();
const confirmations: string[] = [];
const children = new Set<ChildProcess>();
let userId = "", remote = "", server: Server;
const db = () => PostgresDatabase.client;

function child(pause = false) {
  const processChild = spawn(process.execPath, ["--import", "tsx", resolve("tests/fixtures/external-payment-process.ts")], {
    env: { ...process.env, APP_ENV: "test", PROD: "false", EXTERNAL_PROCESS_TEST_REMOTE: remote, EXTERNAL_PROCESS_TEST_PAUSE: pause ? "1" : "0" },
    stdio: ["ignore", "pipe", "pipe", "ipc"], windowsHide: true,
  });
  children.add(processChild);
  let exited = false;
  const exit = new Promise<number | null>(done => processChild.once("exit", code => { exited = true; children.delete(processChild); done(code); }));
  const states: string[] = [];
  processChild.on("message", message => states.push((message as { state: string }).state));
  return { processChild, exit, wait: async (state: string) => {
    const deadline = Date.now() + 15000;
    while (!states.includes(state)) {
      if (exited || states.includes("failed") || Date.now() > deadline) throw new Error(`Child did not reach ${state}`);
      await new Promise(done => setTimeout(done, 20));
    }
  } };
}

const seed = async (paid: boolean) => {
  const order = await repository.saveQuote(userId, "seguripass", { reference: randomUUID(), ticket: "RESTART",
    parking: { id: "fake-parking", name: "Restart fixture" }, amountMinor: 12550, currency: "MXN", expiresAt: Date.now() + 600000, status: "payable" }, Date.now());
  await repository.beginIntent(order.id, Date.now());
  const intent: ExternalIntent = { id: `pi_restart_${order.id}`, orderId: order.id, userId,
    amountMinor: order.amountMinor, currency: "MXN", clientSecret: null, status: "succeeded" };
  intents.set(intent.id, intent);
  await repository.attachIntent(order, intent);
  if (paid) await repository.markPaid(order, intent, Date.now());
  return { order, intent };
};

beforeAll(async () => {
  await PostgresDatabase.connect({ databaseUrl: process.env.DATABASE_URL!, poolMax: 3 });
  const tag = randomUUID();
  userId = (await db().usuario.create({ data: { nombre: "Restart", apellido: "Test", correo: `${tag}@example.com`, telefono: tag, password: "h" } })).id;
  const app = express(); app.use(express.json());
  app.get("/stripe/:id", (req, res) => res.json(intents.get(req.params.id)));
  app.post("/confirm", (req, res) => {
    confirmations.push(req.body.idempotencyKey);
    deliveries.add(req.body.idempotencyKey);
    res.json({ confirmationReference: `remote:${req.body.idempotencyKey}` });
  });
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(done => server.once("listening", done));
  remote = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  for (const running of children) {
    const exited = new Promise(done => running.once("exit", done)); running.kill("SIGKILL"); await exited;
  }
  if (server) { server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); }
  if (userId) {
    const orders = await db().externalPaymentOrder.findMany({ where: { usuarioId: userId }, select: { id: true } });
    await db().operationalIncident.deleteMany({ where: { incidentKey: { in: orders.map(row => `external-payment:${row.id}`) } } });
    await db().externalPaymentEvent.deleteMany({ where: { orderId: { in: orders.map(row => row.id) } } });
    await db().payment.deleteMany({ where: { usuarioId: userId } });
    await db().externalPaymentOrder.deleteMany({ where: { usuarioId: userId } });
    await db().usuario.delete({ where: { id: userId } });
  }
  await PostgresDatabase.disconnect();
});

describe("external payments across actual Node process exits", () => {
  it("recovers a missing webhook in a fresh process using the same persisted intent", async () => {
    const { order, intent } = await seed(false);
    const worker = child(); await worker.wait("finished"); expect(await worker.exit).toBe(0);
    expect((await repository.find(order.id))?.status).toBe("confirmed");
    expect(await db().payment.findUnique({ where: { stripePaymentIntentId: intent.id } })).toMatchObject({ status: "succeeded", reconciliationStatus: "reconciled" });
    expect(await db().payment.count({ where: { referenceId: order.id } })).toBe(1);
  }, 30000);

  it("survives termination after remote confirmation, respects the lease and deduplicates on restart", async () => {
    const { order, intent } = await seed(true);
    const key = `external-confirm:${order.id}`;
    const crashed = child(true); await crashed.wait("remote_confirmed_before_commit");
    crashed.processChild.kill("SIGKILL"); await crashed.exit;
    expect((await repository.find(order.id))?.status).toBe("paid");
    const beforeExpiry = child(); await beforeExpiry.wait("finished"); expect(await beforeExpiry.exit).toBe(0);
    expect(confirmations.filter(value => value === key)).toHaveLength(1);
    // Advance only the persisted lease deadline instead of waiting a minute in the suite.
    await db().externalPaymentOrder.update({ where: { id: order.id }, data: { leaseUntil: new Date(0) } });
    const recovered = child(); await recovered.wait("finished"); expect(await recovered.exit).toBe(0);
    expect(confirmations.filter(value => value === key)).toHaveLength(2);
    expect([...deliveries].filter(value => value === key)).toHaveLength(1);
    expect(await repository.find(order.id)).toMatchObject({ status: "confirmed", stripePaymentIntentId: intent.id });
    expect(await db().payment.count({ where: { referenceId: order.id } })).toBe(1);
    expect(await db().externalPaymentEvent.count({ where: { orderId: order.id, kind: "confirmed" } })).toBe(1);
  }, 60000);
});
