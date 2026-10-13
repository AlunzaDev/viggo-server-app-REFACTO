import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "../../src/generated/prisma/client";
import { PostgresDatabase } from "../../src/data/postgres";
import { UniqueConstraintError } from "../../src/domain/errors/unique-constraint.error";
import type { PensionValidezItemEntity } from "../../src/domain/entities/pension/pension.entity";
import { PaymentPostgresDatasource } from "../../src/infrastructure/datasources/payments/payment.datasource.postgres";
import { StripePaymentPostgresDatasource } from "../../src/infrastructure/datasources/payments/stripe-payment.datasource.postgres";
import { PensionPassPostgresDatasource } from "../../src/infrastructure/datasources/pension/pension-pass.datasource.postgres";
import { PensionPostgresDatasource } from "../../src/infrastructure/datasources/pension/pension.datasource.postgres";
import { PensionPassRepositoryImpl } from "../../src/infrastructure/repositories/pension/pension-pass.repository.impl";
import { PensionRepositoryImpl } from "../../src/infrastructure/repositories/pension/pension.repository.impl";
import { PensionPassService } from "../../src/presentation/services/pension/pension-pass.service";

let db: PrismaClient;
const suffix = Date.now().toString(36);
const tag = (value: string) => `t-${suffix}-${value}`;
const key = (value: string) => `${value}-${suffix}-key-000000`.slice(0, 64);

const pensiones = new PensionPostgresDatasource();
const passes = new PensionPassPostgresDatasource();
const payments = new PaymentPostgresDatasource();
const service = new PensionPassService(new PensionPassRepositoryImpl(passes), new PensionRepositoryImpl(pensiones));

let proyectoId = "";
const users: string[] = [];

const week = (from: number[], to: number[]): PensionValidezItemEntity[] =>
  Array.from({ length: 7 }, (_, weekDay) => ({ weekDay, from, to }));

const cleanup = async () => {
  await db.payment.deleteMany({ where: { concept: { startsWith: tag("") } } });
  await db.pensionPass.deleteMany({ where: { idPass: { startsWith: tag("") } } });
  await db.pension.deleteMany({ where: { nombre: { startsWith: tag("") } } });
  await db.usuario.deleteMany({ where: { telefono: { startsWith: tag("") } } });
  await db.proyecto.deleteMany({ where: { identificador: { startsWith: tag("") } } });
};

const createPension = async (name: string, inventory: number) => {
  const pension = await pensiones.create({
    proyecto: proyectoId,
    nombre: tag(name),
    validez: week([7, 30], [22, 0]),
    precio: 1499.5,
    estado: true,
  });
  for (let index = 0; index < inventory; index += 1) {
    await passes.create({
      name: `P${index}`,
      pension: pension.id,
      idPass: tag(`${name}-${index}`),
      vigent: false,
      antiPassback: true,
      inParking: false,
      created: Date.now() + index,
      from: -1,
      to: -1,
      estado: true,
    });
  }
  return pension;
};

beforeAll(async () => {
  db = await PostgresDatabase.connect({ databaseUrl: process.env.DATABASE_URL!, poolMax: 8 });
  await cleanup();
  proyectoId = (
    await db.proyecto.create({ data: { nombre: "P", coordinates: [0, 0], ciudad: "GDL", identificador: tag("proj") } })
  ).id;
  for (let index = 0; index < 6; index += 1) {
    const usuario = await db.usuario.create({
      data: { nombre: `U${index}`, apellido: "T", correo: `${tag(`u${index}`)}@example.com`, telefono: tag(`u${index}`), password: "h" },
    });
    users.push(usuario.id);
  }
});

afterAll(async () => {
  await cleanup();
  await PostgresDatabase.disconnect();
});

describe("PensionPostgresDatasource", () => {
  it("stores the weekly schedule and price", async () => {
    const pension = await createPension("plan", 0);
    expect(pension.precio).toBe(1499.5);
    expect(pension.validez).toHaveLength(7);
    expect(pension.validez[0]).toEqual({ weekDay: 0, from: [7, 30], to: [22, 0] });

    const updated = await pensiones.update(pension.id, { validez: week([0, 0], [23, 59]), precio: 999 });
    expect(updated?.validez[6]).toEqual({ weekDay: 6, from: [0, 0], to: [23, 59] });
    expect(updated?.precio).toBe(999);
    expect((await pensiones.getByProyecto(proyectoId)).map((item) => item.id)).toContain(pension.id);
  });

  it("rejects invalid schedules with 400 instead of a database error", async () => {
    const base = { proyecto: proyectoId, nombre: tag("bad"), precio: 1, estado: true };
    await expect(pensiones.create({ ...base, validez: week([7, 0], [8, 0]).slice(0, 6) })).rejects.toMatchObject({ statusCode: 400 });
    await expect(pensiones.create({ ...base, validez: week([24, 0], [8, 0]) })).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      pensiones.create({ ...base, validez: week([7, 0], [8, 0]).map((item) => ({ ...item, weekDay: 1 })) }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(pensiones.create({ ...base, proyecto: randomUUID(), validez: week([7, 0], [8, 0]) })).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});

describe("PensionPassService on Postgres", () => {
  let pensionId = "";
  let passId = "";

  beforeAll(async () => {
    pensionId = (await createPension("main", 3)).id;
  });

  it("precontracts a free pass and replays the same key", async () => {
    const pass = await service.precontractPensionPass(users[0], pensionId, 1, key("pre-a"));
    passId = pass.id;
    expect(pass).toMatchObject({ usuario: users[0], vigent: false });
    expect(pass.from).toBeGreaterThan(0);
    expect(pass.to).toBeGreaterThan(pass.from);

    expect((await service.precontractPensionPass(users[0], pensionId, 1, key("pre-a"))).id).toBe(passId);
    await expect(service.precontractPensionPass(users[0], pensionId, 2, key("pre-a"))).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.precontractPensionPass(users[0], pensionId, 1, key("pre-a2"))).rejects.toMatchObject({ statusCode: 400 });
  });

  it("never gives the same pass twice under concurrency", async () => {
    // 2 passes left, 5 users at the same time.
    const results = await Promise.allSettled(
      users.slice(1).map((usuarioId, index) => service.precontractPensionPass(usuarioId, pensionId, 1, key(`race-${index}`))),
    );
    const won = results.filter((result) => result.status === "fulfilled");
    const lost = results.filter((result) => result.status === "rejected");
    expect(won).toHaveLength(2);
    expect(new Set(won.map((result) => (result as PromiseFulfilledResult<{ id: string }>).value.id)).size).toBe(2);
    expect(lost.every((result) => (result as PromiseRejectedResult).reason.statusCode === 409)).toBe(true);
  });

  it("contracts once and replays the same key", async () => {
    const contracted = await service.contractPensionPass(users[0], passId, key("contract-a"));
    expect(contracted.vigent).toBe(true);
    expect((await service.contractPensionPass(users[0], passId, key("contract-a"))).vigent).toBe(true);
    await expect(service.contractPensionPass(users[0], passId, key("contract-b"))).rejects.toMatchObject({ statusCode: 409 });
  });

  it("renews from the current end date and applies only one of two concurrent renewals", async () => {
    const before = await passes.findById(passId);
    const renewed = await service.renewPensionPass(users[0], passId, 2, key("renew-a"));
    const expectedEnd = new Date(before!.to);
    expectedEnd.setMonth(expectedEnd.getMonth() + 2);
    expect(renewed.to).toBe(expectedEnd.getTime());
    expect((await service.renewPensionPass(users[0], passId, 2, key("renew-a"))).to).toBe(renewed.to);

    const race = await Promise.allSettled([
      service.renewPensionPass(users[0], passId, 1, key("renew-b")),
      service.renewPensionPass(users[0], passId, 1, key("renew-c")),
    ]);
    expect(race.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect((race.find((result) => result.status === "rejected") as PromiseRejectedResult).reason.statusCode).toBe(409);

    const operations = await db.pensionPassOperation.findMany({ where: { pensionPassId: passId }, orderBy: { processedAt: "asc" } });
    expect(operations.map((operation) => operation.type)).toEqual(["precontract", "contract", "renew", "renew"]);
  });

  it("cancels a pass once", async () => {
    const cancelled = await service.deletePensionPass(passId, users[0], "  fin  ");
    expect(cancelled.estado).toBe(false);
    expect((await db.pensionPass.findUniqueOrThrow({ where: { id: passId } })).cancellationReason).toBe("fin");
    await expect(service.deletePensionPass(passId, users[0], "otra vez")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("refuses to delete a pension that has passes", async () => {
    await expect(pensiones.delete(pensionId)).rejects.toMatchObject({ statusCode: 409 });
    expect((await pensiones.cancel({ id: pensionId, cancelledBy: users[0], reason: "cierre", cancelledAt: Date.now() }))?.estado).toBe(false);
    expect(await pensiones.cancel({ id: pensionId, cancelledBy: users[0], reason: "x", cancelledAt: Date.now() })).toBeNull();
  });
});

describe("PaymentPostgresDatasource", () => {
  const ticketPayment = (name: string, overrides = {}) => ({
    user: users[0],
    type: "ticket" as const,
    concept: tag(name),
    amount: 50,
    currency: "mxn",
    status: "pending" as const,
    paidAt: Date.now(),
    stripePaymentIntentId: `pi_${suffix}_${name}`,
    idempotencyKey: key(`pay-${name}`),
    reference: { type: "ticket" as const, id: `ticket-${name}` },
    parking: { id: proyectoId },
    rawProviderStatus: "requires_payment_method",
    ...overrides,
  });

  it("creates records and rejects a reused idempotency key", async () => {
    const created = await payments.createRecord(ticketPayment("a"));
    expect(created).toMatchObject({ currency: "MXN", amount: 50, reconciliationStatus: "pending", appliedOperationKey: "" });
    expect((await payments.findRecordByIdempotencyKey(key("pay-a")))?.id).toBe(created.id);
    expect((await payments.findRecordByStripePaymentIntentId(`pi_${suffix}_a`))?.id).toBe(created.id);
    expect(
      (await payments.findRecordForUser({ userId: users[0], stripePaymentIntentId: `pi_${suffix}_a`, referenceId: "ticket-a" }))?.id,
    ).toBe(created.id);
    await expect(payments.createRecord(ticketPayment("a2", { idempotencyKey: key("pay-a") }))).rejects.toBeInstanceOf(
      UniqueConstraintError,
    );
  });

  it("lets only one operation claim a payment", async () => {
    const payment = await payments.createRecord(ticketPayment("claim"));
    await payments.markSucceeded(payment.id, { rawProviderStatus: "succeeded", paidAt: Date.now() });

    const [first, second] = await Promise.all([
      payments.claimForOperation(payment.id, "op-1", Date.now()),
      payments.claimForOperation(payment.id, "op-2", Date.now()),
    ]);
    expect([first, second].filter(Boolean)).toHaveLength(1);
    const winner = (first ?? second)!.appliedOperationKey!;
    expect(await payments.claimForOperation(payment.id, winner, Date.now())).not.toBeNull();
  });

  it("finds payments pending reconciliation", async () => {
    const pending = await payments.createRecord(ticketPayment("rec-pending"));
    const done = await payments.createRecord(ticketPayment("rec-done", { status: "succeeded" }));
    await payments.updateReconciliation(done.id, {
      appliedOperationKey: "apply:done",
      appliedAt: Date.now(),
      reconciliationStatus: "reconciled",
      reconciledAt: Date.now(),
    });
    const ids = (await payments.findPendingReconciliation(500)).map((item) => item.id);
    expect(ids).toContain(pending.id);
    expect(ids).not.toContain(done.id);
  });

  it("serializes history without internal fields and filters by date", async () => {
    const before = Date.now() - 60_000;
    const old = await payments.createRecord(ticketPayment("old", { paidAt: before - 3_600_000 }));
    const { total, payments: page } = await payments.getSerializedByUser(users[0], { page: 1, limit: 100, from: before });
    expect(page.map((item) => item.id)).not.toContain(old.id);
    expect(total).toBe(page.length);
    expect(page[0]).not.toHaveProperty("idempotencyKey");
    expect(page[0]).not.toHaveProperty("stripePaymentIntentId");
    expect(page[0]).not.toHaveProperty("user");
    expect(page[0]).toHaveProperty("reference");

    expect(await payments.findSerializedByIdForUser(old.id, users[1])).toBeNull();
    expect((await payments.findSerializedByIdForUser(old.id, users[0]))?.parking).toMatchObject({ id: proyectoId });
  });

  it("searches history like before", async () => {
    await payments.createRecord(ticketPayment("pen", { type: "pension", concept: tag("Contratacion de pension"), reference: { type: "pension", id: "pp-1" } }));
    const found = await payments.getByUser(users[0], { search: "PENSION", limit: 50 });
    expect(found.every((item) => item.type === "pension" || item.concept.toLowerCase().includes("pension"))).toBe(true);
    expect(found.length).toBeGreaterThan(0);
    expect(await payments.countByUser(users[0], { type: "pension" })).toBe(1);
  });

  it("returns the payer for Stripe", async () => {
    const payer = await new StripePaymentPostgresDatasource().findUserById(users[0]);
    expect(payer).toMatchObject({ correo: `${tag("u0")}@example.com`, nombre: "U0" });
    expect(await new StripePaymentPostgresDatasource().findUserById("bad")).toBeNull();
  });
});
