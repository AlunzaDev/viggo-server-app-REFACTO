import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresDatabase } from "../../src/data/postgres";
import { Prisma } from "../../src/generated/prisma/client";

// statistics_payments: one row per real charge, from the cloud and OPERATIVO (docs/estadisticas.md §4.1).
const db = () => PostgresDatabase.client;
const tag = randomUUID().slice(0, 8);
const installationId = `inst-${tag}`;
const projects = { a: randomUUID(), b: randomUUID() };
const at = new Date("2026-10-15T15:00:00.000Z");
let userId = "";
let passId = "";
let orderId = "";

type Row = { source: string; proyecto_id: string; amount: Prisma.Decimal; status: string; payment_type: string; method: string; refunded_at: Date | null; provider_reference: string | null };
const rows = () => db().$queryRaw<Row[]>`
  SELECT source, proyecto_id::text, amount, status, payment_type, method, refunded_at, provider_reference
  FROM statistics_payments WHERE proyecto_id IN (${projects.a}::uuid, ${projects.b}::uuid) ORDER BY source, amount`;

const cloud = (data: Partial<Prisma.PaymentUncheckedCreateInput>) => db().payment.create({ data: {
  usuarioId: userId, type: "ticket", concept: "Prueba", amount: "50.00", currency: "MXN", status: "succeeded", paidAt: at,
  referenceType: "ticket", referenceId: randomUUID(), ...data,
} });
const mirrored = (proyectoId: string, data: Partial<Prisma.OperationalPaymentUncheckedCreateInput>) => db().operationalPayment.create({ data: {
  proyectoId, installationId, aggregateId: randomUUID(), occurredAt: at, sourcePosition: 1n, eventId: randomUUID(), payload: {},
  paidAt: at, amount: "30.00", currency: "MXN", status: "succeeded", paymentType: "ticket", method: "efectivo", ...data,
} });

describe("statistics_payments", () => {
  beforeAll(async () => {
    await PostgresDatabase.connect({ databaseUrl: process.env.DATABASE_URL!, poolMax: 4 });
    for (const id of Object.values(projects)) {
      await db().proyecto.create({ data: { id, nombre: `Plaza ${tag}`, coordinates: [], ciudad: "GDL", identificador: `${tag}-${id}` } });
    }
    userId = (await db().usuario.create({ data: { nombre: "Cliente", apellido: tag, password: "hash", correo: `${tag}@example.com`, telefono: tag } })).id;
    const pension = await db().pension.create({ data: { proyectoId: projects.a, nombre: tag, precio: 1500 } });
    passId = (await db().pensionPass.create({ data: { pensionId: pension.id, usuarioId: userId, name: tag, idPass: tag, vigent: true } })).id;
    orderId = (await db().externalPaymentOrder.create({ data: { provider: "prov", reference: `REF-${tag}`, proyectoId: projects.a, usuarioId: userId,
      ticket: "1", parkingId: "p", parkingName: "Externo", amountMinor: 8000, currency: "MXN", expiresAt: at, status: "confirmed" } })).id;

    // A charge with the app: in the cloud (Stripe) and applied by OPERATIVO, which mirrors it back.
    await cloud({ proyectoId: projects.a, stripePaymentIntentId: `pi_app_${tag}` });
    await mirrored(projects.a, { providerReference: `pi_app_${tag}`, amount: "50.00", method: "tarjeta" });
    // Cash: only in OPERATIVO; delivered twice with different rows, it is still one charge.
    await mirrored(projects.a, { providerReference: `pos_session_${tag}`, amount: "30.00" });
    await mirrored(projects.a, { providerReference: `pos_session_${tag}`, amount: "30.00", sourcePosition: 2n });
    // A pension paid in the cloud without a parking: it comes from the pass.
    await cloud({ type: "pension", referenceType: "pension", referenceId: passId, amount: "1500.00", stripePaymentIntentId: `pi_pension_${tag}` });
    // An external order saved before payments kept their parking.
    await cloud({ type: "external", referenceType: "external", referenceId: orderId, amount: "80.00", stripePaymentIntentId: `pi_ext_${tag}` });
    // A refunded charge keeps its refund date.
    await cloud({ proyectoId: projects.b, amount: "70.00", status: "refunded", refundedAt: new Date("2026-10-18T10:00:00.000Z"), stripePaymentIntentId: `pi_ref_${tag}` });
    // Cash in the other parking.
    await mirrored(projects.b, { providerReference: null, amount: "20.00" });
  });

  afterAll(async () => {
    await db().operationalPayment.deleteMany({ where: { installationId } });
    await db().payment.deleteMany({ where: { usuarioId: userId } });
    await db().externalPaymentOrder.deleteMany({ where: { id: orderId } });
    await db().pensionPass.deleteMany({ where: { id: passId } });
    await db().pension.deleteMany({ where: { proyectoId: projects.a } });
    await db().proyecto.deleteMany({ where: { id: { in: Object.values(projects) } } });
    await db().usuario.delete({ where: { id: userId } });
    await PostgresDatabase.disconnect();
  });

  it("counts each charge once, the cloud winning over OPERATIVO's mirror", async () => {
    const result = await rows();
    expect(result.map((row) => [row.source, row.proyecto_id === projects.a ? "a" : "b", Number(row.amount), row.method])).toEqual([
      ["nube", "a", 50, "tarjeta"],
      ["nube", "b", 70, "tarjeta"],
      ["nube", "a", 80, "tarjeta"],
      ["nube", "a", 1500, "tarjeta"],
      ["operativo", "b", 20, "efectivo"],
      ["operativo", "a", 30, "efectivo"],
    ]);
  });

  it("puts pensions and external charges in their parking and keeps refund dates", async () => {
    const result = await rows();
    expect(result.find((row) => row.payment_type === "pension")?.proyecto_id).toBe(projects.a);
    expect(result.find((row) => row.payment_type === "external")?.proyecto_id).toBe(projects.a);
    expect(result.find((row) => row.status === "refunded")?.refunded_at).toEqual(new Date("2026-10-18T10:00:00.000Z"));
  });
});
