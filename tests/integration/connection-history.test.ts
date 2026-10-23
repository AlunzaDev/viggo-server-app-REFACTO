import express from "express";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { JwtPlugin } from "../../src/config/plugins/jwt.plugin";
import { PostgresDatabase } from "../../src/data/postgres";
import { SyncPostgresDatasource } from "../../src/infrastructure/datasources/sync/sync.datasource.postgres";
import { buildInstallationPresenceMonitor } from "../../src/presentation/dependencies/system.dependencies";
import { AppRoutes } from "../../src/presentation/routes/routes";

// REFACTO#63: every change of connection of installations and modules, and the downtime.
const db = () => PostgresDatabase.client;
const tag = `ch-${randomUUID().slice(0, 8)}`;
const projects = { a: "", b: "" };
const modules = { a1: "", a2: "", b1: "" };
const tokens = { super: "", scoped: "" };
const users: string[] = [];
const profiles: string[] = [];
const installationId = `${tag}-inst`;
let server: Server;
let base = "";

const MIN = 60_000;
const HOUR = 60 * MIN;
// A past day, so the downtime is clipped to the period and not to "now".
const DAY = Date.UTC(2026, 9, 1, 0, 0, 0);

type Event = { proyectoId: string; moduloId: string | null; moduloNombre: string | null; fromStatus: string; toStatus: string; occurredAt: number };
type Downtime = { proyectoId: string; moduloId: string | null; caidas: number; minutosSinConexion: number };
const get = async <T>(path: string, token = tokens.super) => {
  const response = await fetch(`${base}/api/heartbeat/historial${path}`, { headers: { Authorization: `Bearer ${token}` } });
  return { status: response.status, body: (await response.json()) as T };
};

describe("connection history", () => {
  beforeAll(async () => {
    await PostgresDatabase.connect({ databaseUrl: process.env.DATABASE_URL!, poolMax: 4 });
    for (const key of ["a", "b"] as const) {
      projects[key] = (await db().proyecto.create({ data: { nombre: `${key.toUpperCase()} ${tag}`, ciudad: "CDMX", identificador: `${tag}-${key}`, coordinates: [0, 0] } })).id;
    }
    for (const [key, proyectoId] of [["a1", projects.a], ["a2", projects.a], ["b1", projects.b]] as const) {
      modules[key] = (await db().modulo.create({ data: { proyectoId, nombre: `Caseta ${key}`, tipo: "ENTRADA", identificador: `${tag}-${key}` } })).id;
    }

    // Known stretches for the downtime of the day DAY:
    // a2 was offline since the day before until 00:30 (30 min, no drop within the day);
    // b1 went offline 01:00-01:10 (10 min) and again from 23:00 until the end of the day (60 min).
    const event = (proyectoId: string, moduloId: string, fromStatus: string, toStatus: string, at: number) =>
      db().connectionEvent.create({ data: { proyectoId, moduloId, installationId, fromStatus, toStatus, occurredAt: new Date(at) } });
    await event(projects.a, modules.a2, "online", "offline", DAY - 2 * HOUR);
    await event(projects.a, modules.a2, "offline", "online", DAY + 30 * MIN);
    await event(projects.b, modules.b1, "online", "offline", DAY + HOUR);
    await event(projects.b, modules.b1, "offline", "online", DAY + HOUR + 10 * MIN);
    await event(projects.b, modules.b1, "online", "offline", DAY + 23 * HOUR);

    for (const [key, rol, parkings] of [["super", "SUPER_ROLE", []], ["scoped", "ADMIN_ROLE", [projects.a]]] as const) {
      const profile = await db().permissionProfile.create({ data: { app: "ADMIN_WEB", nombre: `${tag}-${key}`, modules: ["installations"] } });
      profiles.push(profile.id);
      const user = await db().usuario.create({ data: {
        nombre: key, apellido: tag, correo: `${key}-${tag}@example.test`, telefono: `${key}${tag}`.slice(0, 20),
        password: "unused", emailValidated: true, rol, allowedApps: ["ADMIN_WEB"],
        parkings: { create: parkings.map((proyectoId) => ({ proyectoId })) },
        appPermissions: { create: { app: "ADMIN_WEB", permissionProfileId: profile.id } },
      } });
      users.push(user.id);
      tokens[key] = String(await JwtPlugin.generateToken({ id: user.id, app: "ADMIN_WEB" }));
    }

    const app = express(); app.use(express.json()); app.use(AppRoutes.routes);
    server = app.listen(0, "127.0.0.1"); await new Promise<void>((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });

  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    const ids = Object.values(projects);
    await db().operationalIncident.deleteMany({ where: { installationId } });
    await db().jobLease.deleteMany({ where: { name: "installation-presence" } });
    await db().usuario.deleteMany({ where: { id: { in: users } } });
    await db().permissionProfile.deleteMany({ where: { id: { in: profiles } } });
    await db().connectionEvent.deleteMany({ where: { proyectoId: { in: ids } } });
    await db().modulo.deleteMany({ where: { proyectoId: { in: ids } } });
    await db().localInstallation.deleteMany({ where: { proyectoId: { in: ids } } });
    await db().proyecto.deleteMany({ where: { id: { in: ids } } });
    await PostgresDatabase.disconnect();
  });

  it("records a module's changes from the snapshots, dated when OPERATIVO saw them", async () => {
    const sync = new SyncPostgresDatasource();
    const snapshot = (generatedAt: number, heartbeatStatus: string) => sync.receiveHeartbeatSnapshot({
      installationId, proyectoId: projects.a, generatedAt, source: "test", summary: {},
      modules: [{ id: modules.a1, heartbeatStatus, connectionStatus: "CONNECTED", isConnected: heartbeatStatus === "online", isAuthorized: true }],
    });
    const t0 = Date.now() - 10 * MIN;
    await snapshot(t0, "online"); // first report: not a change
    await snapshot(t0 + MIN, "online"); // same status: nothing
    await snapshot(t0 + 2 * MIN, "offline");
    await snapshot(t0 + 5 * MIN, "online");

    const rows = await db().connectionEvent.findMany({ where: { moduloId: modules.a1 }, orderBy: { occurredAt: "asc" } });
    expect(rows.map((row) => [row.fromStatus, row.toStatus, row.occurredAt.getTime()])).toEqual([
      ["online", "offline", t0 + 2 * MIN],
      ["offline", "online", t0 + 5 * MIN],
    ]);
  });

  it("records an installation going offline at its last contact, and coming back", async () => {
    const lastSeen = Date.now() - 10 * MIN;
    await db().localInstallation.create({ data: { installationId, proyectoId: projects.a, status: "approved", lastCommandPollAt: new Date(lastSeen) } });
    await buildInstallationPresenceMonitor().runOnce();
    const back = Date.now();
    await db().localInstallation.update({ where: { installationId }, data: { lastCommandPollAt: new Date(back) } });
    await buildInstallationPresenceMonitor().runOnce();

    const rows = await db().connectionEvent.findMany({ where: { proyectoId: projects.a, moduloId: null }, orderBy: { occurredAt: "asc" } });
    expect(rows.map((row) => [row.fromStatus, row.toStatus, row.occurredAt.getTime()])).toEqual([
      ["online", "offline", lastSeen],
      ["offline", "online", back],
    ]);
  });

  it("lists the events newest first, with filters, within the user's parkings", async () => {
    const all = await get<{ total: number; events: Event[] }>(`?proyecto=${projects.a}`);
    expect(all.status).toBe(200);
    expect(all.body.total).toBe(4);
    const times = all.body.events.map((event) => event.occurredAt);
    expect(times).toEqual(times.slice().sort((x, y) => y - x));
    expect(all.body.events[0]).toMatchObject({ proyectoId: projects.a, moduloId: null, toStatus: "online" });

    const onlyModules = await get<{ events: Event[] }>(`?proyecto=${projects.a}&sujeto=modulo`);
    expect(onlyModules.body.events.every((event) => event.moduloId === modules.a1)).toBe(true);
    expect(onlyModules.body.events[0]?.moduloNombre).toBe("Caseta a1");

    const day = `desde=${DAY}&hasta=${DAY + 24 * HOUR}`;
    const scoped = await get<{ events: Event[] }>(`?${day}`, tokens.scoped);
    expect(scoped.body.events.map((event) => event.proyectoId)).toEqual([projects.a]);
    expect((await get(`?proyecto=${projects.b}`, tokens.scoped)).status).toBe(403);
  });

  it("adds up drops and offline minutes per module, clipped to the period", async () => {
    const day = `desde=${new Date(DAY).toISOString()}&hasta=${new Date(DAY + 24 * HOUR).toISOString()}`;
    const { status, body } = await get<{ items: Downtime[] }>(`/resumen?${day}`);
    expect(status).toBe(200);
    const byModule = new Map(body.items.map((item) => [item.moduloId, item]));
    expect(byModule.get(modules.b1)).toMatchObject({ caidas: 2, minutosSinConexion: 70 });
    expect(byModule.get(modules.a2)).toMatchObject({ caidas: 0, minutosSinConexion: 30 });
    expect(byModule.has(modules.a1)).toBe(false);

    const scoped = await get<{ items: Downtime[] }>(`/resumen?${day}`, tokens.scoped);
    expect(scoped.body.items.map((item) => item.moduloId)).toEqual([modules.a2]);
  });

  it("rejects invalid periods and filters", async () => {
    expect((await get("?desde=ayer")).status).toBe(400);
    expect((await get(`?desde=${DAY + HOUR}&hasta=${DAY}`)).status).toBe(400);
    expect((await get(`?desde=${DAY}&hasta=${DAY + 100 * 24 * HOUR}`)).status).toBe(400);
    expect((await get("?sujeto=otro")).status).toBe(400);
    expect((await get("?proyecto=no-es-uuid")).status).toBe(400);
  });
});
