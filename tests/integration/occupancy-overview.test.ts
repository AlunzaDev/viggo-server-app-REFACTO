import express from "express";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { pensionerIsInside, ticketIsInside, type PensionMove, type TicketPresence } from "@alunzadev/viggo-contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { JwtPlugin } from "../../src/config/plugins/jwt.plugin";
import { PostgresDatabase } from "../../src/data/postgres";
import { AppRoutes } from "../../src/presentation/routes/routes";

// GET /api/ocupacion (REFACTO#61): how full every parking is, and one parking's day by hour.
const db = () => PostgresDatabase.client;
const tag = `occ-${randomUUID().slice(0, 8)}`;
const projects = { a: "", b: "", other: "" };
const tokens = { scoped: "" };
const users: string[] = [];
const profiles: string[] = [];
let server: Server;
let base = "";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
// Every fixture of parking A, to count it with the shared rule too.
const tickets: TicketPresence[] = [];
const moves = new Map<string, PensionMove[]>();

const get = async <T>(path: string, token = tokens.scoped) => {
  const response = await fetch(`${base}/api/ocupacion${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: response.status, body: (await response.json()) as T };
};
const byRule = (at: number) =>
  tickets.filter((ticket) => ticketIsInside(ticket, at)).length + [...moves.values()].filter((passMoves) => pensionerIsInside(passMoves, at)).length;

type Project = { proyectoId: string; autosDentro: number; tickets: number; pensionados: number; capacidad: number | null; porcentaje: number | null; lugaresLibres: number | null };

describe("GET /api/ocupacion", () => {
  beforeAll(async () => {
    await PostgresDatabase.connect({ databaseUrl: process.env.DATABASE_URL!, poolMax: 4 });
    for (const [key, capacidad] of [["a", 4], ["b", null], ["other", 10]] as const) {
      projects[key] = (await db().proyecto.create({ data: {
        nombre: `${key.toUpperCase()} ${tag}`, ciudad: "CDMX", identificador: `${tag}-${key}`, coordinates: [0, 0], capacidad,
      } })).id;
    }
    const now = Date.now();
    const ago = (ms: number) => new Date(now - ms);
    const ticket = (proyectoId: string, horaInicio: Date, horaSalida: Date | null, status = "ACTIVE") => {
      if (proyectoId === projects.a) tickets.push({ horaInicio, horaSalida, status });
      return db().operationalTicket.create({ data: {
        proyectoId, installationId: tag, aggregateId: randomUUID(), occurredAt: new Date(), eventId: randomUUID(), payload: {},
        horaInicio, horaSalida, monto: "0.00", pagado: false, status } });
    };
    const move = (pass: string, tipo: string, fecha: Date) => {
      moves.set(pass, [...(moves.get(pass) ?? []), { tipo, at: fecha }]);
      return db().operationalPensionMove.create({ data: {
        proyectoId: projects.a, installationId: tag, aggregateId: randomUUID(), occurredAt: new Date(), eventId: randomUUID(),
        payload: { tipo }, pensionPassId: pass, fecha } });
    };

    await ticket(projects.a, ago(HOUR), null); // inside
    await ticket(projects.a, ago(30 * MIN), new Date(now + HOUR)); // exit still ahead: inside
    await ticket(projects.a, ago(2 * HOUR), ago(HOUR)); // left
    await ticket(projects.a, ago(8 * DAY), null); // forgotten: more than 7 days
    await ticket(projects.a, ago(20 * MIN), null, "FRAUD"); // fraud without exit
    const [inside, left] = [randomUUID(), randomUUID()];
    await move(inside, "ENTRADA", ago(3 * HOUR));
    await move(left, "ENTRADA", ago(5 * HOUR));
    await move(left, "SALIDA", ago(4 * HOUR));
    await ticket(projects.b, ago(HOUR), null);
    await ticket(projects.other, ago(HOUR), null);

    const profile = await db().permissionProfile.create({ data: { app: "ADMIN_WEB", nombre: tag, modules: ["projects"] } });
    profiles.push(profile.id);
    const user = await db().usuario.create({ data: {
      nombre: "scoped", apellido: tag, correo: `scoped-${tag}@example.test`, telefono: `scoped${tag}`.slice(0, 20),
      password: "unused", emailValidated: true, rol: "ADMIN_ROLE", allowedApps: ["ADMIN_WEB"],
      parkings: { create: [projects.a, projects.b].map((proyectoId) => ({ proyectoId })) },
      appPermissions: { create: { app: "ADMIN_WEB", permissionProfileId: profile.id } },
    } });
    users.push(user.id);
    tokens.scoped = String(await JwtPlugin.generateToken({ id: user.id, app: "ADMIN_WEB" }));

    const app = express(); app.use(express.json()); app.use(AppRoutes.routes);
    server = app.listen(0, "127.0.0.1"); await new Promise<void>((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });

  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    const ids = Object.values(projects);
    await db().operationalTicket.deleteMany({ where: { installationId: tag } });
    await db().operationalPensionMove.deleteMany({ where: { installationId: tag } });
    await db().usuario.deleteMany({ where: { id: { in: users } } });
    await db().permissionProfile.deleteMany({ where: { id: { in: profiles } } });
    await db().proyecto.deleteMany({ where: { id: { in: ids } } });
    await PostgresDatabase.disconnect();
  });

  it("counts the cars inside each parking now, as the shared rule does", async () => {
    const { status, body } = await get<{ proyectos: Project[] }>("");
    expect(status).toBe(200);
    const byId = new Map(body.proyectos.map((project) => [project.proyectoId, project]));
    expect(byId.get(projects.a)).toMatchObject({ tickets: 2, pensionados: 1, autosDentro: byRule(Date.now()), capacidad: 4, porcentaje: 75, lugaresLibres: 1 });
    expect(byRule(Date.now())).toBe(3);
    // Without a captured capacity: never a percentage.
    expect(byId.get(projects.b)).toMatchObject({ autosDentro: 1, capacidad: null, porcentaje: null, lugaresLibres: null });
    expect(byId.has(projects.other)).toBe(false);
  });

  it("consolidates only the parkings with a capacity", async () => {
    const { body } = await get<{ resumen: Record<string, unknown> }>("");
    expect(body.resumen).toEqual({ proyectos: 2, conCapacidad: 1, autosDentro: 4, porcentaje: 75, lugaresLibres: 1 });
  });

  it("gives one parking's day by hour, with the cars inside at each hour's start", async () => {
    const { status, body } = await get<{ capacidad: number; zonaHoraria: string; horas: Array<{ hora: string; dentro: number; entradas: number; salidas: number }> }>(`/${projects.a}/hoy`);
    expect(status).toBe(200);
    expect(body).toMatchObject({ capacidad: 4, zonaHoraria: "America/Mexico_City" });
    // Mexico City keeps UTC-6 all year: its hours start on the UTC hour.
    const hourStart = Math.floor(Date.now() / HOUR) * HOUR;
    const localHour = new Date(hourStart - 6 * HOUR).getUTCHours();
    expect(body.horas).toHaveLength(localHour + 1);
    expect(body.horas.at(-1)).toMatchObject({ hora: `${String(localHour).padStart(2, "0")}:00`, dentro: byRule(hourStart) });
  });

  it("only shows the user's parkings, and needs a session", async () => {
    expect((await get(`/${projects.other}/hoy`)).status).toBe(403);
    // An unknown parking is not the user's either: nothing tells it apart from someone else's.
    expect((await get(`/${randomUUID()}/hoy`)).status).toBe(403);
    expect((await get("", "")).status).toBe(401);
  });
});
