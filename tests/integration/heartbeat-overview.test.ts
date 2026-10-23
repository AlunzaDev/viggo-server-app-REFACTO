import express from "express";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { JwtPlugin } from "../../src/config/plugins/jwt.plugin";
import { PostgresDatabase } from "../../src/data/postgres";
import { AppRoutes } from "../../src/presentation/routes/routes";

// GET /api/heartbeat (REFACTO#60): every parking's heartbeat, with its installation's presence.
const db = () => PostgresDatabase.client;
const tag = `hb-${randomUUID().slice(0, 8)}`;
const projects = { a: "", b: "", c: "", d: "", inactive: "" };
const tokens = { super: "", scoped: "", noModule: "" };
const users: string[] = [];
const profiles: string[] = [];
let server: Server;
let base = "";

type Project = {
  proyectoId: string;
  ubicacion: { lat: number; lng: number } | null;
  instalacion: { estado: string; installationId: string | null; ultimoContacto: number | null };
  estadosVigentes: boolean;
  snapshotRecibido: number | null;
  modulos: { total: number; online: number; offline: number; pending: number };
  ultimoHeartbeat: number | null;
};
type Overview = {
  generadoEn: number;
  resumen: { proyectos: number; instalaciones: Record<string, number>; modulos: Record<string, number>; modulosSinEstadoVigente: number };
  proyectos: Project[];
};

const get = async (token?: string) => {
  const response = await fetch(`${base}/api/heartbeat`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: response.status, body: (await response.json()) as Overview };
};
const ago = (ms: number) => new Date(Date.now() - ms);

describe("GET /api/heartbeat", () => {
  beforeAll(async () => {
    await PostgresDatabase.connect({ databaseUrl: process.env.DATABASE_URL!, poolMax: 4 });
    for (const key of Object.keys(projects) as Array<keyof typeof projects>) {
      projects[key] = (await db().proyecto.create({ data: {
        nombre: `${key.toUpperCase()} ${tag}`, ciudad: "CDMX", identificador: `${tag}-${key}`, estado: key !== "inactive",
        // A: a point; B: an area; the rest without a captured location.
        coordinates: key === "a" ? [-99.13, 19.43] : key === "b" ? [[-117, 32], [-117.2, 32.2]] : [0, 0],
      } })).id;
    }

    const installation = (proyectoId: string, lastSeen: Date) => db().localInstallation.create({ data: {
      installationId: `${tag}-${proyectoId.slice(-6)}`, proyectoId, status: "approved", lastCommandPollAt: lastSeen,
    } });
    const snapshot = (proyectoId: string, receivedAt: Date) => db().projectHeartbeatSnapshot.create({ data: {
      proyectoId, installationId: tag, source: "test", generatedAt: receivedAt, receivedAt,
    } });
    let n = 0;
    const modulo = async (proyectoId: string, heartbeatStatus: "online" | "offline" | null, estado = true) => {
      const created = await db().modulo.create({ data: { proyectoId, nombre: `M${++n}`, tipo: "ENTRADA", identificador: `${tag}-m${n}`, estado } });
      if (heartbeatStatus) {
        await db().moduloDeviceState.create({ data: {
          moduloId: created.id, heartbeatStatus, isConnected: heartbeatStatus === "online", isAuthorized: true,
          lastHeartbeatAt: ago(20_000), syncedAt: new Date(),
        } });
      }
    };

    // A: reachable, fresh snapshot; online, offline and never-reported modules, plus an inactive one.
    await installation(projects.a, ago(10_000));
    await snapshot(projects.a, ago(30_000));
    await modulo(projects.a, "online");
    await modulo(projects.a, "offline");
    await modulo(projects.a, null);
    await modulo(projects.a, "online", false);
    // B: last poll 90 s ago (degraded), snapshot still recent.
    await installation(projects.b, ago(90_000));
    await snapshot(projects.b, ago(90_000));
    await modulo(projects.b, "online");
    // C: unreachable for 10 min: its two "online" modules are only the last known state.
    await installation(projects.c, ago(600_000));
    await snapshot(projects.c, ago(600_000));
    await modulo(projects.c, "online");
    await modulo(projects.c, "online");
    // D: no installation yet. The inactive parking has one, but is not listed.
    await installation(projects.inactive, ago(1_000));

    for (const [key, rol, modules, parkings] of [
      ["super", "SUPER_ROLE", ["projects"], []],
      ["scoped", "ADMIN_ROLE", ["installations"], [projects.a, projects.b, projects.c, projects.d, projects.inactive]],
      ["noModule", "ADMIN_ROLE", ["payments"], [projects.a]],
    ] as const) {
      const profile = await db().permissionProfile.create({ data: { app: "ADMIN_WEB", nombre: `${tag}-${key}`, modules: [...modules] } });
      profiles.push(profile.id);
      const user = await db().usuario.create({ data: {
        nombre: key, apellido: tag, correo: `${key.toLowerCase()}-${tag}@example.test`, telefono: `${key}${tag}`.slice(0, 20),
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
    await db().usuario.deleteMany({ where: { id: { in: users } } });
    await db().permissionProfile.deleteMany({ where: { id: { in: profiles } } });
    await db().modulo.deleteMany({ where: { proyectoId: { in: ids } } });
    await db().localInstallation.deleteMany({ where: { proyectoId: { in: ids } } });
    await db().proyecto.deleteMany({ where: { id: { in: ids } } });
    await PostgresDatabase.disconnect();
  });

  it("shows each parking's installation presence and its module states", async () => {
    const { status, body } = await get(tokens.scoped);
    expect(status).toBe(200);
    const byId = new Map(body.proyectos.map((project) => [project.proyectoId, project]));

    expect(byId.get(projects.a)).toMatchObject({
      instalacion: { estado: "online" }, estadosVigentes: true, modulos: { total: 3, online: 1, offline: 1, pending: 1 },
    });
    expect(byId.get(projects.a)?.ultimoHeartbeat).toBeGreaterThan(Date.now() - 60_000);
    expect(byId.get(projects.b)).toMatchObject({ instalacion: { estado: "degraded" }, estadosVigentes: true, modulos: { total: 1, online: 1 } });
    // Unreachable: the counts are kept, but marked as not current.
    expect(byId.get(projects.c)).toMatchObject({ instalacion: { estado: "offline" }, estadosVigentes: false, modulos: { total: 2, online: 2 } });
    expect(byId.get(projects.d)).toMatchObject({
      instalacion: { estado: "sin_instalacion", installationId: null, ultimoContacto: null },
      estadosVigentes: false, snapshotRecibido: null, modulos: { total: 0, online: 0, offline: 0, pending: 0 }, ultimoHeartbeat: null,
    });
    expect(byId.has(projects.inactive)).toBe(false);
  });

  it("places each parking on the map from its point or the center of its area", async () => {
    const { body } = await get(tokens.scoped);
    const byId = new Map(body.proyectos.map((project) => [project.proyectoId, project]));
    expect(byId.get(projects.a)?.ubicacion).toEqual({ lat: 19.43, lng: -99.13 });
    expect(byId.get(projects.b)?.ubicacion?.lat).toBeCloseTo(32.1);
    expect(byId.get(projects.b)?.ubicacion?.lng).toBeCloseTo(-117.1);
    expect(byId.get(projects.d)?.ubicacion).toBeNull();
  });

  it("sums only current module states and counts installations by presence", async () => {
    const { body } = await get(tokens.scoped);
    expect(body.resumen).toEqual({
      proyectos: 4,
      instalaciones: { online: 1, degraded: 1, offline: 1, sin_instalacion: 1 },
      modulos: { total: 4, online: 2, offline: 1, pending: 1 },
      modulosSinEstadoVigente: 2,
    });
    expect(body.generadoEn).toBeGreaterThan(Date.now() - 60_000);
  });

  it("lists every active parking for a super user, and only the assigned ones otherwise", async () => {
    const all = await get(tokens.super);
    expect(all.status).toBe(200);
    const ids = all.body.proyectos.map((project) => project.proyectoId);
    for (const id of [projects.a, projects.b, projects.c, projects.d]) expect(ids).toContain(id);
    expect(ids).not.toContain(projects.inactive);

    const scoped = await get(tokens.scoped);
    expect(scoped.body.proyectos.map((project) => project.proyectoId).sort()).toEqual([projects.a, projects.b, projects.c, projects.d].sort());
  });

  it("requires a session and the projects or installations module", async () => {
    expect((await get()).status).toBe(401);
    expect((await get(tokens.noModule)).status).toBe(403);
  });
});
