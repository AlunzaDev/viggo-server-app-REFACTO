import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PostgresDatabase } from "../../src/data/postgres";
import { SyncPostgresDatasource } from "../../src/infrastructure/datasources/sync/sync.datasource.postgres";
import { OperationalInboxProcessor, operationalTables } from "../../src/infrastructure/datasources/sync/operational-inbox.processor";
import { LocalProjectsPostgresDatasource } from "../../src/infrastructure/datasources/local-projects/local-projects.datasource.postgres";
import { Prisma } from "../../src/generated/prisma/client";

const sync = new SyncPostgresDatasource();
const processor = new OperationalInboxProcessor();
let project: string;
let other: string;
const installationId = randomUUID();
const now = Date.now();
const event = (kind: string, id: string, position: string, payload: object = {}) => ({
  eventId: randomUUID(), installationId, proyectoId: project, aggregateId: id,
  eventType: `${kind}.updated`, occurredAt: now, sourcePosition: position,
  payload: { id, ...payload },
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
      const e = event(kind, randomUUID(), "1", { ticket_id: randomUUID(), shift_id: randomUUID() });
      await sync.receiveEvent(e);
      expect((await PostgresDatabase.client.inboxEvent.findUniqueOrThrow({ where: { eventId: e.eventId } })).processedAt).not.toBeNull();
      const rows = await PostgresDatabase.client.$queryRaw<Array<{ payload: unknown }>>(Prisma.sql`
        SELECT payload FROM ${Prisma.raw(operationalTables[kind])} WHERE aggregate_id = ${e.aggregateId}`);
      expect(rows[0].payload).toEqual(e.payload);
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
    await PostgresDatabase.client.inboxEvent.update({ where: { eventId: e.eventId }, data: { payload: { id: e.aggregateId, proyecto_id: project } } });
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
