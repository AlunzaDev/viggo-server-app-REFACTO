import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresDatabase } from "../../src/data/postgres";
import type { MetricId } from "../../src/domain/statistics/catalog";
import type { StatisticsQuery } from "../../src/domain/statistics/statistics";
import { OperationalInboxProcessor } from "../../src/infrastructure/datasources/sync/operational-inbox.processor";
import { buildStatisticsService } from "../../src/presentation/dependencies";
import { buildHourlyTotalsStore } from "../../src/presentation/dependencies/repositories.dependencies";

// Statistics totals per parking and hour (#55, docs/estadisticas-carga.md §5): the metrics read
// them for whole past hours and must give the same figures as reading every row.
const db = () => PostgresDatabase.client;
const totals = buildHourlyTotalsStore();
const statistics = buildStatisticsService();
const tag = `hourly-${randomUUID().slice(0, 8)}`;
const installationId = tag;
let proyectoId = "";
let userId = "";
const at = (iso: string) => new Date(iso);
// Three days with odd minutes, so a range of instants starts and ends inside an hour.
const from = Date.parse("2026-10-10T05:37:00Z"), to = Date.parse("2026-10-13T08:12:00Z");

const ticket = (inicio: string, salida: string | null, monto: string, pagado: boolean) => db().operationalTicket.create({ data: {
  proyectoId, installationId, aggregateId: randomUUID(), occurredAt: at(inicio), eventId: randomUUID(), payload: {},
  horaInicio: at(inicio), horaSalida: salida ? at(salida) : null, monto, pagado, status: salida ? "COMPLETED" : "ACTIVE" } });
const mirror = (paidAt: string, amount: number, reference: string, method: string) => db().operationalPayment.create({ data: {
  proyectoId, installationId, aggregateId: randomUUID(), occurredAt: at(paidAt), eventId: randomUUID(), payload: {},
  paidAt: at(paidAt), amount, currency: "MXN", status: "succeeded", paymentType: "ticket", method, providerReference: reference } });
const cloud = (paidAt: string, amount: number, reference: string, refundedAt?: string) => db().payment.create({ data: {
  usuarioId: userId, type: "ticket", concept: tag, amount, currency: "MXN", status: refundedAt ? "refunded" : "succeeded",
  paidAt: at(paidAt), refundedAt: refundedAt ? at(refundedAt) : null, stripePaymentIntentId: reference, referenceType: "ticket", referenceId: randomUUID(), proyectoId } });

/** Every metric the totals serve, by every grouping it allows, for the range. */
const figures = async (now: number, rango: StatisticsQuery["rango"] = { kind: "instants", from, to }) => {
  const asked: Array<[MetricId, StatisticsQuery["agrupar"]]> = [
    ["ingresos.cobrados", null], ["ingresos.cobrados", "metodo"], ["ingresos.cobrados", "hora"], ["ingresos.reembolsos", "dia"],
    ["ingresos.netos", "tipo"], ["ingresos.netos", "dia"], ["externos.cobros", null],
    ["tickets.entradas", "hora"], ["tickets.salidas", "dia"], ["tickets.ticket_promedio", "dia"], ["tickets.estancia", null], ["tickets.estancia", "proyecto"],
  ];
  const results = [];
  for (const [metric, agrupar] of asked) {
    const result = await statistics.run({ proyectos: [proyectoId], metricas: [metric], rango, agrupar, comparar: false }, now, { coverage: false });
    results.push({ metric, agrupar, ...result.metricas[0] });
  }
  return results;
};

describe("statistics totals per hour", () => {
  beforeAll(async () => {
    await PostgresDatabase.connect({ databaseUrl: process.env.DATABASE_URL!, poolMax: 4 });
    proyectoId = (await db().proyecto.create({ data: { nombre: tag, ciudad: "TIJ", identificador: tag, coordinates: [0, 0], zonaHoraria: "America/Tijuana" } })).id;
    userId = (await db().usuario.create({ data: { nombre: "Cliente", apellido: tag, correo: `${tag}@example.test`, telefono: tag.slice(0, 20), password: "unused" } })).id;

    // Before the range, inside its first partial hour, whole hours, and its last partial hour.
    await ticket("2026-10-10T05:10:00Z", "2026-10-10T05:50:00Z", "20.00", true);
    await ticket("2026-10-10T09:00:00Z", "2026-10-10T10:30:00Z", "30.00", true);
    await ticket("2026-10-11T14:05:00Z", "2026-10-11T23:45:00Z", "150.00", true);
    await ticket("2026-10-12T02:00:00Z", "2026-10-12T02:10:00Z", "0.00", false);
    await ticket("2026-10-13T08:00:00Z", "2026-10-13T08:05:00Z", "15.00", true);
    await ticket("2026-10-13T07:30:00Z", null, "0.00", false);
    await mirror("2026-10-10T05:49:00Z", 20, `pos_session_${tag}-1`, "efectivo");
    await mirror("2026-10-10T10:29:00Z", 30, `pos_session_${tag}-2`, "efectivo");
    // A card charge in both places: counts once, as the cloud's.
    await mirror("2026-10-11T23:44:00Z", 150, `pi_${tag}-a`, "tarjeta");
    await cloud("2026-10-11T23:44:00Z", 150, `pi_${tag}-a`);
    // Charged inside the range and refunded on another day, also inside.
    await cloud("2026-10-12T12:00:00Z", 60, `pi_${tag}-b`, "2026-10-13T08:01:00Z");
    await mirror("2026-10-13T08:04:00Z", 15, `pos_session_${tag}-3`, "efectivo");
    // Tijuana's clocks go back on 2026-11-01: that local day has 25 hours, two of them 01:xx.
    await ticket("2026-10-31T20:00:00Z", "2026-11-01T08:30:00Z", "60.00", true);
    await ticket("2026-11-01T08:40:00Z", "2026-11-01T09:30:00Z", "15.00", true);
    await ticket("2026-11-01T09:45:00Z", "2026-11-02T07:50:00Z", "150.00", true);
    await mirror("2026-11-01T09:29:00Z", 15, `pos_session_${tag}-dst`, "efectivo");
    await totals.rebuild([proyectoId], Date.parse("2026-10-09T00:00:00Z"), Date.parse("2026-10-14T00:00:00Z"));
    await totals.rebuild([proyectoId], Date.parse("2026-10-30T00:00:00Z"), Date.parse("2026-11-04T00:00:00Z"));
    // The shared test database keeps hours marked by earlier runs; only this parking's matter here.
    await db().statisticsHourlyPending.deleteMany({ where: { proyectoId: { not: proyectoId } } });
  });

  afterAll(async () => {
    await db().payment.deleteMany({ where: { concept: tag } });
    await db().inboxEvent.deleteMany({ where: { installationId } });
    await db().statisticsHourlyPending.deleteMany({ where: { proyectoId } });
    await db().usuario.deleteMany({ where: { id: userId } });
    await db().proyecto.deleteMany({ where: { id: proyectoId } });
    await PostgresDatabase.disconnect();
  });

  it("gives the same figures from the totals as reading every row", async () => {
    // `now` before the range: nothing is a whole past hour, so everything is read live.
    const live = await figures(from - 1);
    const hourly = await figures(Date.parse("2026-10-20T00:00:00Z"));
    expect(hourly).toEqual(live);
    const byId = (id: string, agrupar: string | null = null) => hourly.find((item) => item.metric === id && item.agrupar === agrupar)!;
    // The 05:10 ticket entered before the range; the 05:49 charge is inside it.
    expect(byId("ingresos.cobrados").valor).toBe("275.00");
    expect(byId("ingresos.netos", "dia").serie).toEqual(expect.arrayContaining([{ clave: "2026-10-13", valor: "-45.00" }]));
    expect(byId("tickets.estancia").valor).toMatchObject({ tickets: 5, promedioMinutos: 145 });
  });

  it("gives the same figures from whole local days, also on a 25-hour day", async () => {
    const days: StatisticsQuery["rango"] = { kind: "dates", desde: "2026-10-31", hasta: "2026-11-02" };
    const late = Date.parse("2026-11-20T00:00:00Z");
    expect(await figures(late, days)).toEqual(await figures(Date.parse("2026-10-01T00:00:00Z"), days));
    // The 25-hour local day is a single row with all its hours: both 01:xx exits, and the one at
    // 07:50 UTC of the 2nd, still 23:50 of the 1st in Tijuana (UTC-8 after the change).
    const nov1 = await db().statisticsDailyTicket.findUniqueOrThrow({ where: { proyectoId_dia: { proyectoId, dia: at("2026-11-01T00:00:00Z") } } });
    expect(nov1).toMatchObject({ salidas: 3, estancias: 3 });
    const exits = (await statistics.run({ proyectos: [proyectoId], metricas: ["tickets.salidas"], rango: days, agrupar: "dia", comparar: false }, late, { coverage: false })).metricas[0];
    expect(exits.serie).toEqual([{ clave: "2026-11-01", valor: 3 }]);
  });

  it("marks the hours an inbox event changes and recomputes them", async () => {
    const id = randomUUID();
    const event = await db().inboxEvent.create({ data: {
      eventId: randomUUID(), installationId, proyectoId, eventType: "ticket.created", aggregateId: id, occurredAt: at("2026-10-12T16:20:00Z"),
      payload: { id, hora_inicio: "2026-10-12T16:20:00.000Z", hora_salida: "2026-10-12T18:05:00.000Z", monto: "45.00", pagado: true, status: "COMPLETED" },
    } });
    await new OperationalInboxProcessor().processEvent(event.eventId);
    const pending = await db().statisticsHourlyPending.findMany({ where: { proyectoId }, orderBy: { hora: "asc" } });
    expect(pending.map((row) => row.hora.toISOString())).toEqual(["2026-10-12T16:00:00.000Z", "2026-10-12T18:00:00.000Z"]);

    await totals.refresh(Date.now(), 1000);
    expect(await db().statisticsHourlyPending.count({ where: { proyectoId } })).toBe(0);
    const exitHour = await db().statisticsHourlyTicket.findUniqueOrThrow({ where: { proyectoId_hora: { proyectoId, hora: at("2026-10-12T18:00:00Z") } } });
    expect(exitHour).toMatchObject({ salidas: 1, pagados: 1, estancias: 1, estanciaMinutos: 105 });
    // Its local day (Tijuana, 2026-10-12) is summed again with it: its only entry.
    const day = await db().statisticsDailyTicket.findUniqueOrThrow({ where: { proyectoId_dia: { proyectoId, dia: at("2026-10-12T00:00:00Z") } } });
    expect(day.entradas).toBe(1);
  });

  it("follows cloud payment changes: a late refund lands in its own hour", async () => {
    const payment = await cloud("2026-10-11T03:15:00Z", 80, `pi_${tag}-c`);
    await totals.refresh(Date.now(), 1000);
    const charged = await db().statisticsHourlyPayment.findMany({ where: { proyectoId, hora: at("2026-10-11T03:00:00Z") } });
    expect(charged).toEqual([expect.objectContaining({ movimiento: "cobro", metodo: "tarjeta", pagos: 1 })]);

    await db().payment.update({ where: { id: payment.id }, data: { status: "refunded", refundedAt: at("2026-10-12T20:30:00Z") } });
    await totals.refresh(Date.now(), 1000);
    const refund = await db().statisticsHourlyPayment.findMany({ where: { proyectoId, hora: at("2026-10-12T20:00:00Z") } });
    expect(refund).toEqual([expect.objectContaining({ movimiento: "reembolso", pagos: 1 })]);
    expect(Number(refund[0].monto)).toBe(80);
  });

  it("drops OPERATIVO's copy when the cloud has the same charge", async () => {
    await mirror("2026-10-11T04:10:00Z", 99, `pi_${tag}-d`, "tarjeta");
    await totals.rebuild([proyectoId], Date.parse("2026-10-11T04:00:00Z"), Date.parse("2026-10-11T05:00:00Z"));
    expect((await db().statisticsHourlyPayment.findMany({ where: { proyectoId, hora: at("2026-10-11T04:00:00Z") } })).map((row) => Number(row.monto))).toEqual([99]);

    // The app's payment reaches the cloud: from now on only the cloud's record counts.
    await cloud("2026-10-11T04:09:00Z", 99, `pi_${tag}-d`);
    await totals.refresh(Date.now(), 1000);
    const hour = await db().statisticsHourlyPayment.findMany({ where: { proyectoId, hora: at("2026-10-11T04:00:00Z") } });
    expect(hour).toHaveLength(1);
    expect(hour[0]).toMatchObject({ metodo: "tarjeta", pagos: 1 });
  });
});
