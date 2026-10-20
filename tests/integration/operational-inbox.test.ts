import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PostgresDatabase } from "../../src/data/postgres";
import { SyncPostgresDatasource } from "../../src/infrastructure/datasources/sync/sync.datasource.postgres";
import { OperationalInboxProcessor, operationalTables } from "../../src/infrastructure/datasources/sync/operational-inbox.processor";
import { LocalProjectsPostgresDatasource } from "../../src/infrastructure/datasources/local-projects/local-projects.datasource.postgres";
import { Prisma } from "../../src/generated/prisma/client";
import { ParkingRateCopyPostgresDatasource } from "../../src/infrastructure/datasources/parking/parking-rate-copy.datasource.postgres";

const sync = new SyncPostgresDatasource();
const processor = new OperationalInboxProcessor();
let project: string;
let other: string;
const installationId = randomUUID();
const now = Date.now();
/** A parking_rates row of OPERATIVO as to_jsonb sends it. */
const rateRow = (version: number, extra: object = {}) => ({ version, proyecto_id: project, tolerance_minutes: 15, first_block_minutes: 60,
  first_block_price: 20.00, fraction_minutes: 15, fraction_price: 5.00, daily_max: 150.00, created_by: "admin-op", created_at: new Date(now).toISOString(), ...extra });
/**
 * What OPERATIVO's rows always carry, so a fixture only states what its test is about. Dated
 * in the past so they never fall inside a report window another test checks.
 */
const PAST = "2026-01-15T12:00:00.000Z";
const rowDefaults: Record<string, object> = {
  ticket: { hora_inicio: PAST, hora_salida: null, monto: "0", pagado: false, status: "ACTIVE" },
  payment: { paid_at: PAST, amount: "10.00", currency: "MXN", status: "succeeded", type: "ticket", provider_reference: null },
};
const event = (kind: string, id: string, position: string, payload: object = {}) => ({
  eventId: randomUUID(), installationId, proyectoId: project, aggregateId: id,
  eventType: `${kind}.updated`, occurredAt: now, sourcePosition: position,
  payload: { id, ...rowDefaults[kind], ...payload },
});
beforeAll(async () => {
  const db = await PostgresDatabase.connect({ databaseUrl: process.env.DATABASE_URL!, poolMax: 8 });
  const create = () => db.proyecto.create({ data: { nombre: "Inbox test", ciudad: "GDL", coordinates: [0,0], identificador: randomUUID() } });
  project = (await create()).id; other = (await create()).id;
});
afterAll(async () => {
  const db = PostgresDatabase.client;
  await db.inboxEvent.deleteMany({ where: { proyectoId: { in: [project, other] } } });
  await db.proyecto.deleteMany({ where: { id: { in: [project, other] } } });
  await PostgresDatabase.disconnect();
});
describe("operational inbox", () => {
  it("projects every trigger type even when dependent parents are missing", async () => {
    for (const kind of Object.keys(operationalTables)) {
      const e = event(kind, randomUUID(), "1", { ticket_id: randomUUID(), shift_id: randomUUID(),
        ...(kind === "pension_move" ? { pension_pass_id: randomUUID(), fecha: new Date(now).toISOString() } : {}),
        ...(kind === "parking_rate" ? rateRow(1) : {}) });
      await sync.receiveEvent(e);
      expect((await PostgresDatabase.client.inboxEvent.findUniqueOrThrow({ where: { eventId: e.eventId } })).processedAt).not.toBeNull();
      const rows = await PostgresDatabase.client.$queryRaw<Array<{ payload: unknown }>>(Prisma.sql`
        SELECT payload FROM ${Prisma.raw(operationalTables[kind])} WHERE aggregate_id = ${e.aggregateId}`);
      expect(rows[0].payload).toEqual(e.payload);
    }
  });
  it("copies a pension move's pass and time to its indexed columns, and holds a malformed one", async () => {
    const passId = randomUUID();
    const fecha = "2026-10-20T09:15:00.123-06:00";
    const move = event("pension_move", randomUUID(), "1", { pension_pass_id: passId, fecha, tipo: "ENTRADA" });
    await sync.receiveEvent(move);
    const row = await PostgresDatabase.client.operationalPensionMove.findFirstOrThrow({ where: { aggregateId: move.aggregateId } });
    expect(row).toMatchObject({ pensionPassId: passId, fecha: new Date(fecha) });

    // A later update of the same move keeps the columns in step with the payload.
    const corrected = event("pension_move", move.aggregateId, "2", { pension_pass_id: passId, fecha: "2026-10-20T15:20:00.000Z", tipo: "ENTRADA" });
    await sync.receiveEvent(corrected);
    expect((await PostgresDatabase.client.operationalPensionMove.findFirstOrThrow({ where: { aggregateId: move.aggregateId } })).fecha)
      .toEqual(new Date("2026-10-20T15:20:00.000Z"));

    const malformed = event("pension_move", randomUUID(), "1", { pension_pass_id: "no-es-uuid", fecha });
    await sync.receiveEvent(malformed);
    const pending = await PostgresDatabase.client.inboxEvent.findUniqueOrThrow({ where: { eventId: malformed.eventId } });
    expect(pending).toMatchObject({ processedAt: null, processingError: "Invalid snapshot pension_pass_id" });
  });
  it("keeps a copy of OPERATIVO's parking rate, the last one saved in force, and holds malformed ones", async () => {
    const rates = new ParkingRateCopyPostgresDatasource();
    // Saved after the rate the first test left in this project.
    const saved = (version: number, minutesLater: number, extra: object = {}) =>
      ({ ...event("parking_rate", randomUUID(), String(version), rateRow(version, extra)), eventType: "parking_rate.created", occurredAt: now + minutesLater * 60_000 });
    await sync.receiveEvent(saved(1, 1));
    await sync.receiveEvent(saved(2, 2, { daily_max: null, first_block_price: 25.5 }));
    // A reset installation starts again at version 1: being the last saved, it is the one in force.
    const afterReset = saved(1, 3, { first_block_price: 30 });
    await sync.receiveEvent(afterReset);

    const list = await rates.listRates(project, 3);
    expect(list.map((rate) => [rate.version, rate.firstBlockPrice])).toEqual([[1, 30], [2, 25.5], [1, 20]]);
    expect(list[1]).toMatchObject({ dailyMax: null, toleranceMinutes: 15, createdBy: "admin-op", installationId });
    expect(list[0].savedAt).toBe(afterReset.occurredAt);

    const malformed = saved(3, 4, { fraction_price: "cinco" });
    await sync.receiveEvent(malformed);
    expect(await PostgresDatabase.client.inboxEvent.findUniqueOrThrow({ where: { eventId: malformed.eventId } }))
      .toMatchObject({ processedAt: null, processingError: "Invalid snapshot money: fraction_price" });
    expect(await rates.listRates(other, 10)).toEqual([]);
  });
  it("copies tickets and payments to typed columns for statistics, and holds impossible dates", async () => {
    const db = PostgresDatabase.client;
    const ticketId = randomUUID();
    await sync.receiveEvent(event("ticket", ticketId, "1", { hora_inicio: "2026-10-20T08:00:00.000-06:00", hora_salida: "2026-10-20T09:20:00.000-06:00", monto: 30, pagado: true, status: "COMPLETED" }));
    expect(await db.operationalTicket.findFirstOrThrow({ where: { aggregateId: ticketId } })).toMatchObject({
      horaInicio: new Date("2026-10-20T14:00:00.000Z"), horaSalida: new Date("2026-10-20T15:20:00.000Z"), pagado: true, status: "COMPLETED",
    });
    expect((await db.operationalTicket.findFirstOrThrow({ where: { aggregateId: ticketId } })).monto?.toString()).toBe("30");

    const cash = randomUUID();
    const card = randomUUID();
    await sync.receiveEvent(event("payment", cash, "1", { amount: "42.50", provider_reference: "pos_session_123" }));
    await sync.receiveEvent(event("payment", card, "1", { amount: 99, currency: "mxn", provider_reference: "pi_abc", type: "pension" }));
    const rows = await db.operationalPayment.findMany({ where: { aggregateId: { in: [cash, card] } }, orderBy: { aggregateId: "asc" } });
    const byId = Object.fromEntries(rows.map((row) => [row.aggregateId, row]));
    expect(byId[cash]).toMatchObject({ method: "efectivo", currency: "MXN", status: "succeeded", paymentType: "ticket", providerReference: "pos_session_123" });
    expect(byId[cash].amount?.toString()).toBe("42.5");
    expect(byId[card]).toMatchObject({ method: "tarjeta", currency: "MXN", paymentType: "pension", providerReference: "pi_abc" });

    // A later exit updates the columns along with the payload.
    await sync.receiveEvent(event("ticket", ticketId, "2", { hora_inicio: "2026-10-20T08:00:00.000-06:00", hora_salida: null, monto: 0, pagado: false, status: "ACTIVE" }));
    expect(await db.operationalTicket.findFirstOrThrow({ where: { aggregateId: ticketId } })).toMatchObject({ horaSalida: null, pagado: false });

    // Like the year-2200 tickets seen in cobrocaja: the event waits instead of polluting reports.
    for (const [kind, payload, error] of [
      ["ticket", { hora_inicio: "2200-01-01T00:00:00.000Z" }, "Invalid snapshot date: hora_inicio"],
      ["ticket", { hora_inicio: "2019-12-31T00:00:00.000Z" }, "Invalid snapshot date: hora_inicio"],
      ["payment", { paid_at: "2200-01-01T00:00:00.000Z" }, "Invalid snapshot date: paid_at"],
      ["ticket", { pagado: "si" }, "Invalid snapshot pagado"],
    ] as const) {
      const bad = event(kind, randomUUID(), "1", payload);
      await sync.receiveEvent(bad);
      expect(await db.inboxEvent.findUniqueOrThrow({ where: { eventId: bad.eventId } })).toMatchObject({ processedAt: null, processingError: error });
    }
  });
  it("does not regress on late creates, duplicate retries or concurrent deliveries", async () => {
    const id = randomUUID();
    const latest = event("ticket", id, "9007199254740993", { pagado: true, monto: "42.50" });
    const late = { ...event("ticket", id, "9007199254740992", { pagado: false, monto: "0" }), eventType: "ticket.created" };
    await Promise.all([sync.receiveEvent(latest), sync.receiveEvent(late), sync.receiveEvent(latest)]);
    expect(await sync.receiveEvent(latest)).toMatchObject({ duplicate: true });
    const row = await PostgresDatabase.client.operationalTicket.findUniqueOrThrow({ where: {
      proyectoId_installationId_aggregateId: { proyectoId: project, installationId, aggregateId: id },
    } });
    expect(row.payload).toEqual(latest.payload);
    expect(row.sourcePosition).toBe(9007199254740993n);
    expect(await PostgresDatabase.client.inboxEvent.count({ where: { eventId: latest.eventId } })).toBe(1);
  });
  it("supports legacy events ordered by occurrence time", async () => {
    const id = randomUUID();
    const latest = { ...event("payment", id, "1", { amount: "50" }), sourcePosition: undefined };
    await sync.receiveEvent(latest);
    await sync.receiveEvent({ ...latest, eventId: randomUUID(), occurredAt: now - 10_000, payload: { id, amount: "10" } });
    expect((await PostgresDatabase.client.operationalPayment.findFirstOrThrow({ where: { aggregateId: id } })).payload).toEqual(latest.payload);
  });
  it("keeps failed events pending, retries after repair, and isolates projects", async () => {
    const e = event("ticket", randomUUID(), "1", { proyecto_id: other });
    await sync.receiveEvent(e);
    const row = await PostgresDatabase.client.inboxEvent.findUniqueOrThrow({ where: { eventId: e.eventId } });
    expect(row.processedAt).toBeNull(); expect(row.processingError).toContain("another project");
    await PostgresDatabase.client.inboxEvent.update({ where: { eventId: e.eventId }, data: { payload: { ...e.payload, proyecto_id: project } } });
    await sync.receiveEvent(e); // Redelivery processes the stored receipt, never replaces it.
    expect((await PostgresDatabase.client.inboxEvent.findUniqueOrThrow({ where: { eventId: e.eventId } })).processedAt).not.toBeNull();
    const unknown = { ...event("unknown", randomUUID(), "1") };
    await sync.receiveEvent(unknown);
    expect((await PostgresDatabase.client.inboxEvent.findUniqueOrThrow({ where: { eventId: unknown.eventId } })).processingError).toContain("Unsupported");
    const backlog = event("payment", randomUUID(), "1");
    await PostgresDatabase.client.inboxEvent.create({ data: { ...backlog, occurredAt: new Date(now), sourcePosition: 1n } });
    await processor.processPending();
    expect((await PostgresDatabase.client.inboxEvent.findUniqueOrThrow({ where: { eventId: backlog.eventId } })).processedAt).not.toBeNull();
  });
  it("rejects invalid positions and retains malformed snapshots without poisoning reports", async () => {
    await expect(sync.receiveEvent(event("ticket", randomUUID(), "9223372036854775808"))).rejects.toMatchObject({ statusCode: 400 });
    const bad = event("ticket", randomUUID(), "1", { hora_inicio: "invalid-date", pagado: true, monto: "oops" });
    await sync.receiveEvent(bad);
    const receipt = await PostgresDatabase.client.inboxEvent.findUniqueOrThrow({ where: { eventId: bad.eventId } });
    expect(receipt.processedAt).toBeNull();
    expect(receipt.processingError).toContain("Invalid snapshot date");
    expect(await PostgresDatabase.client.operationalTicket.count({ where: { aggregateId: bad.aggregateId } })).toBe(0);
    await PostgresDatabase.client.inboxEvent.update({ where: { eventId: bad.eventId }, data: { payload: { id: bad.aggregateId, hora_inicio: "2020-01-01T00:00:00Z", pagado: true, monto: "10.00" }, lastAttemptAt: new Date(0) } });
    await processor.processPending();
    expect((await PostgresDatabase.client.inboxEvent.findUniqueOrThrow({ where: { eventId: bad.eventId } })).processingError).toBe("");
  });
  it("serves historical totals from cloud while no local URL exists, without mixing projects", async () => {
    const started = new Date(now).toISOString();
    await sync.receiveEvent(event("ticket", randomUUID(), "1", { hora_inicio: started, pagado: true, monto: "42.50" }));
    await sync.receiveEvent(event("payment", randomUUID(), "1", { paid_at: started, status: "succeeded", amount: "42.50" }));
    await sync.receiveEvent(event("cash_payment_session", randomUUID(), "1", { started_at: started, status: "completed", amount_expected: "42.50", amount_received: "50", change_amount: "7.50" }));
    await sync.receiveEvent(event("cash_register_movement", randomUUID(), "1", { created_at: started, direction: "in", amount: "42.50" }));
    await sync.receiveEvent(event("cash_register_shift", randomUUID(), "1", { status: "open", opening_amount: "100", opened_at: started }));
    const reports = new LocalProjectsPostgresDatasource();
    const result = await reports.getSnapshot({ projectId: project, from: String(now-1000), to: String(now+1000) });
    expect(result.status).toBe("ok");
    expect(result.snapshot?.summary.tickets).toEqual({ total: 1, paid: 1, unpaid: 0, amount: 42.5 });
    expect(result.snapshot?.summary.payments).toEqual([{ _id: "succeeded", count: 1, amount: 42.5 }]);
    expect(result.snapshot?.summary.cashSessions[0]).toMatchObject({ expected: 42.5, received: 50, change: 7.5 });
    expect(result.snapshot?.openShifts[0]).toMatchObject({ openingAmount: 100, openedAt: now });
    expect(result.snapshot?.recent.tickets[0]).toMatchObject({ horaInicio: now, monto: 42.5 });
    expect((await reports.getSnapshot({ projectId: other })).snapshot?.summary.tickets.total).toBe(0);
  });
});
