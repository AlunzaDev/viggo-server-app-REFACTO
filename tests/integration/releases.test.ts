import express from "express";
import { createHash, randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { JwtPlugin } from "../../src/config/plugins/jwt.plugin";
import { PostgresDatabase } from "../../src/data/postgres";
import { SyncPostgresDatasource } from "../../src/infrastructure/datasources/sync/sync.datasource.postgres";
import { AppRoutes } from "../../src/presentation/routes/routes";

// REFACTO#67: the release catalog, its channels, what each installation should run and what it runs.
const db = () => PostgresDatabase.client;
const tag = `rel-${randomUUID().slice(0, 8)}`;
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const digest = (n: number) => `sha256:${String(n).padStart(64, "0")}`;
const projects = { pilot: "", other: "" };
const installations = { pilot: `${tag}-pilot`, other: `${tag}-other` };
const syncToken = `${tag}-token`;
const tokens = { super: "", admin: "" };
const users: string[] = [];
const profiles: string[] = [];
let moduloId = "";
let server: Server;
let base = "";

const api = async (method: string, path: string, body?: unknown, token = tokens.super) => {
  const response = await fetch(`${base}/api/releases${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
};
const desired = async (installationId: string, query = "") => {
  const response = await fetch(`${base}/api/sync/releases${query}`, { headers: { Authorization: `Bearer ${syncToken}`, "X-Viggo-Installation-Id": installationId } });
  return { status: response.status, body: await response.json() as Record<string, any> };
};
const pkg = (component: string, version: string, platform: string, n: number) =>
  ({ component, version, platform, image: component === "expendedora" ? "cejadali/viggo-expendedora" : "ghcr.io/alunzadev/viggo-operativo", digest: digest(n) });

describe("releases", () => {
  beforeAll(async () => {
    await PostgresDatabase.connect({ databaseUrl: process.env.DATABASE_URL!, poolMax: 4 });
    // Each test run starts from empty channels: they are global.
    await db().releaseChannel.deleteMany({});
    for (const key of ["pilot", "other"] as const) {
      projects[key] = (await db().proyecto.create({ data: { nombre: `${key} ${tag}`, ciudad: "CDMX", identificador: `${tag}-${key}`, coordinates: [0, 0] } })).id;
      await db().localInstallation.create({ data: { installationId: installations[key], proyectoId: projects[key], status: "approved", syncTokenHash: sha256(syncToken) } });
    }
    moduloId = (await db().modulo.create({ data: { proyectoId: projects.pilot, nombre: "Caseta", tipo: "ENTRADA", identificador: `${tag}-m` } })).id;
    for (const [key, rol] of [["super", "SUPER_ROLE"], ["admin", "ADMIN_ROLE"]] as const) {
      const profile = await db().permissionProfile.create({ data: { app: "ADMIN_WEB", nombre: `${tag}-${key}`, modules: ["projects"] } });
      profiles.push(profile.id);
      const user = await db().usuario.create({ data: {
        nombre: key, apellido: tag, correo: `${key}-${tag}@example.test`, telefono: `${key}${tag}`.slice(0, 20), password: "unused", emailValidated: true, rol, allowedApps: ["ADMIN_WEB"],
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
    await db().releaseChannel.deleteMany({});
    await db().releasePackage.deleteMany({ where: { digest: { in: [1, 2, 3, 4, 5].map(digest) } } });
    await db().usuario.deleteMany({ where: { id: { in: users } } });
    await db().permissionProfile.deleteMany({ where: { id: { in: profiles } } });
    await db().modulo.deleteMany({ where: { id: moduloId } });
    await db().localInstallation.deleteMany({ where: { installationId: { in: Object.values(installations) } } });
    await db().proyecto.deleteMany({ where: { id: { in: Object.values(projects) } } });
    await PostgresDatabase.disconnect();
  });

  it("registers only pinned builds, once, and only for super administrators", async () => {
    for (const [index, item] of [pkg("expendedora", "1.0.0", "linux/arm64", 1), pkg("expendedora", "1.1.0", "linux/arm64", 2),
      pkg("expendedora", "1.2.0", "linux/arm64", 3), pkg("operativo", "2.0.0", "linux/amd64", 4)].entries()) {
      expect((await api("POST", "/paquetes", item)).status, `package ${index}`).toBe(201);
    }
    expect((await api("POST", "/paquetes", pkg("expendedora", "1.0.0", "linux/arm64", 5))).status).toBe(409);
    expect((await api("POST", "/paquetes", { ...pkg("expendedora", "1.3.0", "linux/arm64", 5), digest: "latest" })).status).toBe(400);
    expect((await api("POST", "/paquetes", { ...pkg("expendedora", "1.3.0", "linux/arm64", 5), image: "cejadali/viggo:latest" })).status).toBe(400);
    expect((await api("POST", "/paquetes", pkg("expendedora", "1.3.0", "linux/arm64", 5), tokens.admin)).status).toBe(403);
  });

  it("sets the general and pilot versions, only with registered versions and existing parkings", async () => {
    expect((await api("PUT", "/canales/expendedora", { generalVersion: "9.9.9" })).status).toBe(400);
    expect((await api("PUT", "/canales/expendedora", { pilotProjects: [randomUUID()] })).status).toBe(400);
    expect((await api("PUT", "/canales/otro", { generalVersion: "1.1.0" })).status).toBe(404);
    expect((await api("PUT", "/canales/expendedora", { generalVersion: "1.1.0", pilotVersion: "1.2.0", pilotProjects: [projects.pilot] })).status).toBe(200);
    expect((await api("PUT", "/canales/operativo", { generalVersion: "2.0.0" })).status).toBe(200);

    const catalog = await api("GET", "");
    const expendedora = (catalog.body.componentes as Array<Record<string, any>>).find((item) => item.component === "expendedora");
    expect(expendedora?.canal).toMatchObject({ generalVersion: "1.1.0", pilotVersion: "1.2.0", pilotProjects: [projects.pilot] });
    expect(expendedora?.versionAnterior).toBe("1.0.0");
  });

  it("tells each installation what to run: pilot or general, and only for each platform", async () => {
    const pilot = await desired(installations.pilot, "?plataforma=linux/amd64");
    expect(pilot.status).toBe(200);
    expect(pilot.body.operativo).toMatchObject({ version: "2.0.0", digest: digest(4), channel: "general" });
    expect(pilot.body.expendedora["linux/arm64"]).toMatchObject({ version: "1.2.0", channel: "pilot", digest: digest(3) });
    expect(pilot.body.expendedora["linux/amd64"]).toBeNull();

    const other = await desired(installations.other);
    expect(other.body.expendedora["linux/arm64"]).toMatchObject({ version: "1.1.0", channel: "general" });
    // Its platform is unknown until it reports one: no OPERATIVO image is offered.
    expect(other.body.operativo).toBeNull();

    expect((await fetch(`${base}/api/sync/releases`)).status).toBe(401);
  });

  it("rolls back by pointing the channel to the previous version", async () => {
    await api("PUT", "/canales/expendedora", { generalVersion: "1.0.0" });
    expect((await desired(installations.other)).body.expendedora["linux/arm64"]).toMatchObject({ version: "1.0.0" });
  });

  it("records what OPERATIVO and its modules report, and compares it with what they should run", async () => {
    await new SyncPostgresDatasource().receiveHeartbeatSnapshot({
      installationId: installations.pilot, proyectoId: projects.pilot, generatedAt: Date.now(), source: "test", summary: {},
      metadata: { release: { version: "1.9.0", platform: "linux/amd64" } },
      modules: [{ id: moduloId, heartbeatStatus: "online", release: { version: "1.2.0", platform: "linux/arm64" } }],
    });
    const { status, body } = await api("GET", "/estado");
    expect(status).toBe(200);
    const row = (body.instalaciones as Array<Record<string, any>>).find((item) => item.installationId === installations.pilot);
    expect(row?.operativo).toMatchObject({ version: "1.9.0", plataforma: "linux/amd64", deseada: { version: "2.0.0", canal: "general" }, actualizar: true });
    expect(row?.expendedoras[0]).toMatchObject({ version: "1.2.0", deseada: { version: "1.2.0", canal: "pilot" }, actualizar: false });

    // Its own reported platform is used when it does not send one.
    expect((await desired(installations.pilot)).body.operativo).toMatchObject({ version: "2.0.0" });
    const other = (body.instalaciones as Array<Record<string, any>>).find((item) => item.installationId === installations.other);
    expect(other?.operativo).toMatchObject({ version: null, actualizar: false });
  });
});
