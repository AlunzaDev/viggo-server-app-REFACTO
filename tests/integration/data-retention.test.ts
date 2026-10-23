import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresDatabase } from "../../src/data/postgres";
import { buildDataRetentionRepository, buildJobLockRepository } from "../../src/presentation/dependencies/repositories.dependencies";
import { DataRetentionJob, retentionPlan } from "../../src/presentation/services/system/data-retention.job";

// REFACTO#70: old finished data goes; anything pending, open, recent or a total stays.
const db = () => PostgresDatabase.client;
const tag = `ret-${randomUUID().slice(0, 8)}`;
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();
const old = new Date(NOW - 2000 * DAY); // older than every period
const recent = new Date(NOW - DAY);
let proyectoId = "";
let usuarioId = "";
const installationId = `${tag}-inst`;
const ids: Record<string, string> = {};

const plan = retentionPlan({ financial: 1825, operational: 1825, inbox: 30, mobileOperations: 90, incidents: 365, connectionEvents: 365, pushSubscriptions: 180 });
const job = (batchSize = 2) => new DataRetentionJob(buildDataRetentionRepository(), buildJobLockRepository(), plan, { batchSize });
/** Sets a timestamp column directly: Prisma would overwrite @updatedAt. */
const backdate = (table: string, column: string, where: string, at: Date) =>
  db().$executeRawUnsafe(`UPDATE ${table} SET ${column} = $1 WHERE ${where}`, at);

describe("DataRetentionJob", () => {
  beforeAll(async () => {
    await PostgresDatabase.connect({ databaseUrl: process.env.DATABASE_URL!, poolMax: 4 });
    proyectoId = (await db().proyecto.create({ data: { nombre: tag, ciudad: "CDMX", identificador: tag, coordinates: [0, 0] } })).id;
    usuarioId = (await db().usuario.create({ data: {
      nombre: "r", apellido: tag, correo: `${tag}@example.test`, telefono: tag.slice(0, 20), password: "unused", rol: "CLIENT_ROLE",
    } })).id;
    await db().localInstallation.create({ data: { installationId, proyectoId, status: "approved" } });

    // Inbox: old processed (goes), old unprocessed (stays), recent processed (stays).
    for (const [key, occurredAt, processedAt] of [["inboxOld", old, old], ["inboxPending", old, null], ["inboxRecent", recent, recent]] as const) {
      ids[key] = randomUUID();
      await db().inboxEvent.create({ data: { eventId: ids[key]!, installationId, proyectoId, eventType: "ticket.created", aggregateId: randomUUID(), occurredAt, payload: {}, processedAt } });
    }
    // Five mirror tickets: more than one batch of 2, to go through the batching.
    for (let i = 0; i < 5; i++) {
      await db().operationalTicket.create({ data: { proyectoId, installationId: tag, aggregateId: randomUUID(), occurredAt: old, eventId: randomUUID(), payload: {} } });
    }
    await db().operationalTicket.create({ data: { proyectoId, installationId: tag, aggregateId: randomUUID(), occurredAt: recent, eventId: randomUUID(), payload: {} } });
    await db().operationalCashCut.create({ data: { proyectoId, installationId: tag, aggregateId: randomUUID(), occurredAt: old, eventId: randomUUID(), payload: {} } });

    // Mobile operations: old completed (goes), old dead_letter (stays).
    for (const [key, status] of [["opDone", "completed"], ["opDead", "dead_letter"]] as const) {
      ids[key] = randomUUID();
      await db().mobileOperation.create({ data: { operationId: ids[key]!, idempotencyKey: `${tag}-${key}`, type: "CREATE_TICKET", installationId, proyectoId, usuarioId, status } });
      await backdate("mobile_operations", "updated_at", `operation_id = '${ids[key]}'`, old);
    }
    // Incidents: old resolved (goes), old open (stays).
    for (const [key, status] of [["incResolved", "resolved"], ["incOpen", "open"]] as const) {
      ids[key] = `${tag}-${key}`;
      await db().operationalIncident.create({ data: { incidentKey: ids[key]!, type: "INSTALLATION_OFFLINE", status, severity: "critical", source: "test", proyectoId, message: "x", openedAt: old, lastSeenAt: old, resolvedAt: status === "resolved" ? old : null } });
    }
    await db().connectionEvent.create({ data: { proyectoId, installationId, fromStatus: "online", toStatus: "offline", occurredAt: old } });
    await db().connectionEvent.create({ data: { proyectoId, installationId, fromStatus: "offline", toStatus: "online", occurredAt: recent } });
    await db().pushSubscription.create({ data: { usuarioId, endpoint: `https://push.example/${tag}/old`, p256dh: "k", auth: "a", createdAt: old } });
    await db().pushSubscription.create({ data: { usuarioId, endpoint: `https://push.example/${tag}/used`, p256dh: "k", auth: "a", createdAt: old, lastSuccessAt: recent } });

    // A 6-year-old payment goes; a 6-year-old external order goes with its event.
    ids.payment = (await db().payment.create({ data: { usuarioId, type: "ticket", concept: tag, amount: 10, currency: "MXN", status: "succeeded", proyectoId, createdAt: old, paidAt: old, referenceType: "ticket", referenceId: randomUUID() } })).id;
    await backdate("payments", "updated_at", `id = '${ids.payment}'`, old);
    ids.order = (await db().externalPaymentOrder.create({ data: {
      provider: tag, reference: tag, usuarioId, ticket: "T", parkingId: "P", parkingName: "P", amountMinor: 1000, currency: "MXN", expiresAt: old, proyectoId, createdAt: old,
    } })).id;
    await backdate("external_payment_orders", "updated_at", `id = '${ids.order}'`, old);
    await db().externalPaymentEvent.create({ data: { orderId: ids.order!, kind: "created" } });

    // A statistics total of that old period: it must stay.
    await db().statisticsDailyTicket.create({ data: {
      proyectoId, dia: new Date(old.toISOString().slice(0, 10)), entradas: 1, salidas: 1, entradasHora: [], salidasHora: [], pagados: 0,
      montoPagado: 0, estancias: 0, estanciaMinutos: 0, estanciaBuckets: [], estanciaBucketMinutos: [], estanciaIngresos: [],
    } });
  });

  afterAll(async () => {
    await db().externalPaymentEvent.deleteMany({ where: { order: { provider: tag } } });
    await db().externalPaymentOrder.deleteMany({ where: { provider: tag } });
    await db().payment.deleteMany({ where: { concept: tag } });
    await db().inboxEvent.deleteMany({ where: { installationId } });
    await db().operationalTicket.deleteMany({ where: { installationId: tag } });
    await db().operationalCashCut.deleteMany({ where: { installationId: tag } });
    await db().mobileOperation.deleteMany({ where: { installationId } });
    await db().operationalIncident.deleteMany({ where: { incidentKey: { startsWith: tag } } });
    await db().jobLease.deleteMany({ where: { name: "data-retention" } });
    await db().statisticsDailyTicket.deleteMany({ where: { proyectoId } });
    await db().usuario.deleteMany({ where: { id: usuarioId } });
    await db().localInstallation.deleteMany({ where: { installationId } });
    await db().proyecto.deleteMany({ where: { id: proyectoId } });
    await PostgresDatabase.disconnect();
  });

  it("purges old finished data in batches, and keeps what is pending, open or recent", async () => {
    const run = await job().runOnce(NOW);
    expect(run).toMatchObject({ complete: true, error: "" });
    expect(run?.deleted.operational_tickets).toBeGreaterThanOrEqual(5);

    expect(await db().inboxEvent.findMany({ where: { installationId }, select: { eventId: true } }).then((rows) => rows.map((row) => row.eventId).sort()))
      .toEqual([ids.inboxPending, ids.inboxRecent].sort());
    expect(await db().operationalTicket.count({ where: { installationId: tag } })).toBe(1);
    expect(await db().operationalCashCut.count({ where: { installationId: tag } })).toBe(0);
    expect(await db().mobileOperation.findMany({ where: { installationId }, select: { operationId: true } })).toEqual([{ operationId: ids.opDead }]);
    expect(await db().operationalIncident.findMany({ where: { incidentKey: { startsWith: tag } }, select: { incidentKey: true } })).toEqual([{ incidentKey: ids.incOpen }]);
    expect(await db().connectionEvent.count({ where: { proyectoId } })).toBe(1);
    expect(await db().pushSubscription.findMany({ where: { usuarioId }, select: { endpoint: true } })).toEqual([{ endpoint: `https://push.example/${tag}/used` }]);
    expect(await db().payment.count({ where: { concept: tag } })).toBe(0);
    expect(await db().externalPaymentOrder.count({ where: { provider: tag } })).toBe(0);
  });

  it("does not touch the statistics totals", async () => {
    expect(await db().statisticsDailyTicket.count({ where: { proyectoId } })).toBe(1);
  });

  it("reports the run and runs nothing when another instance holds the lock", async () => {
    expect(DataRetentionJob.getHealthSnapshot()).toMatchObject({ status: "ok", lastRun: { complete: true } });
    await db().jobLease.upsert({ where: { name: "data-retention" }, create: { name: "data-retention", owner: "other", acquiredAt: new Date(), expiresAt: new Date(Date.now() + 60_000) }, update: { owner: "other", expiresAt: new Date(Date.now() + 60_000) } });
    expect(await job().runOnce(NOW)).toBeNull();
  });
});
