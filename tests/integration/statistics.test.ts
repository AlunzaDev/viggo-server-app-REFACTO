import express from "express";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { JwtPlugin } from "../../src/config/plugins/jwt.plugin";
import { PostgresDatabase } from "../../src/data/postgres";
import { AppRoutes } from "../../src/presentation/routes/routes";

// GET /api/estadisticas: metrics aggregated in PostgreSQL, per parking time zone and user scope.
const db = () => PostgresDatabase.client;
const tag = `stats-${randomUUID().slice(0, 8)}`;
const projects = { cdmx: "", tijuana: "" };
let server: Server;
let base = "";
const tokens = { super: "", scoped: "" };
const users: string[] = [];
let profileId = "";

type Metric = { id: string; estado: string; valor: unknown; serie?: Array<{ clave: string; valor: unknown }>; anterior?: unknown };
type Response = { metricas: Metric[]; cobertura: Array<{ proyectoId: string; desactualizada: boolean }>; parcial: boolean; zonasMezcladas: boolean };
const get = async (query: string, token = tokens.super) => {
  const response = await fetch(`${base}/api/estadisticas?${query}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: response.status, body: await response.json() as Response & { error?: string } };
};
const metric = (body: Response, id: string) => body.metricas.find((item) => item.id === id)!;

describe("GET /api/estadisticas", () => {
  beforeAll(async () => {
    await PostgresDatabase.connect({ databaseUrl: process.env.DATABASE_URL!, poolMax: 6 });
    projects.cdmx = (await db().proyecto.create({ data: { nombre: `CDMX ${tag}`, ciudad: "CDMX", identificador: `${tag}-cdmx`, coordinates: [0, 0] } })).id;
    projects.tijuana = (await db().proyecto.create({ data: { nombre: `TIJ ${tag}`, ciudad: "TIJ", identificador: `${tag}-tij`, coordinates: [0, 0], zonaHoraria: "America/Tijuana" } })).id;
    profileId = (await db().permissionProfile.create({ data: { app: "ADMIN_WEB", nombre: tag, modules: ["payments"] } })).id;
    for (const [key, rol, parkings] of [["super", "SUPER_ROLE", []], ["scoped", "ADMIN_ROLE", [projects.cdmx]]] as const) {
      const user = await db().usuario.create({ data: { nombre: key, apellido: tag, correo: `${key}-${tag}@example.test`, telefono: `${key}${tag}`.slice(0, 20),
        password: "unused", emailValidated: true, rol, allowedApps: ["ADMIN_WEB"],
        parkings: { create: parkings.map((proyectoId) => ({ proyectoId })) },
        appPermissions: { create: { app: "ADMIN_WEB", permissionProfileId: profileId } } } });
      users.push(user.id);
      tokens[key] = String(await JwtPlugin.generateToken({ id: user.id, app: "ADMIN_WEB" }));
    }

    const charge = (proyectoId: string, amount: number, paidAt: string, extra: object = {}) => db().payment.create({ data: {
      usuarioId: users[0], type: "ticket", concept: tag, amount, currency: "MXN", status: "succeeded", paidAt: new Date(paidAt),
      stripePaymentIntentId: `pi_${randomUUID()}`, referenceType: "ticket", referenceId: randomUUID(), proyectoId, ...extra,
    } });
    // 2026-10-16 06:30 UTC: already the 16th in Mexico City (00:30), still the 15th in Tijuana (23:30).
    await charge(projects.cdmx, 100, "2026-10-16T06:30:00.000Z");
    await charge(projects.tijuana, 200, "2026-10-16T06:30:00.000Z");
    // Charged on the 15th (local), refunded on the 20th: it counts as charged on the 15th and refunded on the 20th.
    await charge(projects.cdmx, 50, "2026-10-15T18:00:00.000Z", { status: "refunded", refundedAt: new Date("2026-10-20T18:00:00.000Z") });
    // The day before, for the comparison.
    await charge(projects.cdmx, 40, "2026-10-14T18:00:00.000Z");
    // A ticket of the Tijuana parking with its stay (typed columns, as the processor stores them).
    await db().operationalTicket.create({ data: { proyectoId: projects.tijuana, installationId: tag, aggregateId: randomUUID(), occurredAt: new Date(), eventId: randomUUID(),
      payload: {}, horaInicio: new Date("2026-10-15T17:00:00.000Z"), horaSalida: new Date("2026-10-15T18:30:00.000Z"), monto: "45.00", pagado: true } });
    // Tijuana's OPERATIVO sent something a minute ago; Mexico City's never did.
    await db().inboxEvent.create({ data: { eventId: randomUUID(), installationId: tag, proyectoId: projects.tijuana, eventType: "ticket.updated",
      aggregateId: randomUUID(), occurredAt: new Date(Date.now() - 60_000), payload: {} } });

    const app = express(); app.use(express.json()); app.use(AppRoutes.routes);
    server = app.listen(0, "127.0.0.1"); await new Promise<void>((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });

  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    await db().inboxEvent.deleteMany({ where: { installationId: tag } });
    await db().operationalTicket.deleteMany({ where: { installationId: tag } });
    await db().payment.deleteMany({ where: { concept: tag } });
    await db().usuario.deleteMany({ where: { id: { in: users } } });
    await db().permissionProfile.deleteMany({ where: { id: profileId } });
    await db().proyecto.deleteMany({ where: { id: { in: Object.values(projects) } } });
    await PostgresDatabase.disconnect();
  });

  it("counts each parking's days in its own time zone", async () => {
    const both = `proyectos=${projects.cdmx},${projects.tijuana}`;
    const day15 = await get(`metricas=ingresos.cobrados&desde=2026-10-15&hasta=2026-10-15&agrupar=proyecto&${both}`);
    expect(day15.status).toBe(200);
    // On the 15th: Tijuana's 200 (still its 15th) and Mexico City's 50 (later refunded), not Mexico City's 100.
    expect(metric(day15.body, "ingresos.cobrados")).toMatchObject({ estado: "ok", valor: "250.00",
      serie: expect.arrayContaining([{ clave: projects.tijuana, valor: "200.00" }, { clave: projects.cdmx, valor: "50.00" }]) });
    expect(day15.body.zonasMezcladas).toBe(true);
    const day16 = await get(`metricas=ingresos.cobrados&desde=2026-10-16&hasta=2026-10-16&${both}`);
    expect(metric(day16.body, "ingresos.cobrados").valor).toBe("100.00");
  });

  it("counts refunds on the date they were made, and compares with the previous period", async () => {
    const q = `proyectos=${projects.cdmx}&metricas=ingresos.cobrados,ingresos.reembolsos,ingresos.netos`;
    const charged = await get(`${q}&desde=2026-10-15&hasta=2026-10-15&comparar=true`);
    expect(metric(charged.body, "ingresos.netos")).toMatchObject({ valor: "50.00", anterior: "40.00" });
    expect(metric(charged.body, "ingresos.reembolsos").valor).toBe("0.00");
    const refunded = await get(`${q}&desde=2026-10-20&hasta=2026-10-20`);
    expect(metric(refunded.body, "ingresos.reembolsos").valor).toBe("50.00");
    expect(metric(refunded.body, "ingresos.netos").valor).toBe("-50.00");
  });

  it("reports stays, empty averages and data coverage per parking", async () => {
    const result = await get(`metricas=tickets.estancia,tickets.ticket_promedio,tickets.salidas&desde=2026-10-15&hasta=2026-10-15&proyectos=${projects.cdmx},${projects.tijuana}`);
    expect(metric(result.body, "tickets.estancia").valor).toMatchObject({ tickets: 1, promedioMinutos: 90, medianaMinutos: 90 });
    expect(metric(result.body, "tickets.ticket_promedio")).toMatchObject({ estado: "ok", valor: "45.00" });
    const onlyCdmx = await get(`metricas=tickets.ticket_promedio&desde=2026-10-15&hasta=2026-10-15&proyectos=${projects.cdmx}`);
    expect(metric(onlyCdmx.body, "tickets.ticket_promedio")).toMatchObject({ estado: "sin_datos", valor: null });
    const coverage = Object.fromEntries(result.body.cobertura.map((item) => [item.proyectoId, item.desactualizada]));
    expect(coverage).toEqual({ [projects.cdmx]: true, [projects.tijuana]: false });
  });

  it("applies the user's scope, also when consolidating, and validates the request", async () => {
    expect((await get("metricas=ingresos.netos&desde=2026-10-15&hasta=2026-10-15", "")).status).toBe(401);
    expect((await get(`metricas=ingresos.netos&desde=2026-10-15&hasta=2026-10-15&proyectos=${projects.tijuana}`, tokens.scoped)).status).toBe(403);
    // Without projects, the scoped user consolidates only its own parking.
    const own = await get("metricas=ingresos.cobrados&desde=2026-10-15&hasta=2026-10-16", tokens.scoped);
    expect(own.body.cobertura.map((item) => item.proyectoId)).toEqual([projects.cdmx]);
    expect(metric(own.body, "ingresos.cobrados").valor).toBe("150.00");
    expect((await get("metricas=ingresos.netos;DROP&desde=2026-10-15&hasta=2026-10-15")).status).toBe(400);
    expect((await get("metricas=tickets.salidas&desde=2026-01-01&hasta=2026-10-15&agrupar=hora")).status).toBe(400);
  });
});
