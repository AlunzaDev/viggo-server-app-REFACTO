import express from "express";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { JwtPlugin } from "../../src/config/plugins/jwt.plugin";
import { PostgresDatabase } from "../../src/data/postgres";
import { AppRoutes } from "../../src/presentation/routes/routes";

// /api/proyectos: the parkings, limited to the ones the user sees.
const db = () => PostgresDatabase.client;
const tag = `pry-${randomUUID().slice(0, 8)}`;
const projects = { own: "", other: "" };
const created: string[] = [];
let server: Server;
let base = "";
const tokens = { super: "", scoped: "" };
const users: string[] = [];
let profileId = "";

const call = async (method: string, path: string, body?: unknown, token = tokens.scoped) => {
  const response = await fetch(`${base}/api/proyectos${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json() as Record<string, any> };
};

describe("/api/proyectos", () => {
  beforeAll(async () => {
    await PostgresDatabase.connect({ databaseUrl: process.env.DATABASE_URL!, poolMax: 4 });
    projects.own = (await db().proyecto.create({ data: { nombre: `Plaza Ñuñoa ${tag}`, ciudad: "Guadalajara", identificador: `${tag}-own`, coordinates: [0, 0],
      descripcion: "Sótano", installationLinkTokenHash: "x" } })).id;
    projects.other = (await db().proyecto.create({ data: { nombre: `Otra ${tag}`, ciudad: "Monterrey", identificador: `${tag}-other`, coordinates: [0, 0], estado: false } })).id;
    profileId = (await db().permissionProfile.create({ data: { app: "ADMIN_WEB", nombre: tag, modules: ["projects"] } })).id;
    for (const [key, rol, parkings] of [["super", "SUPER_ROLE", []], ["scoped", "ADMIN_ROLE", [projects.own]]] as const) {
      const user = await db().usuario.create({ data: { nombre: key, apellido: tag, correo: `${key}-${tag}@example.test`, telefono: `${key}${tag}`.slice(0, 20),
        password: "unused", emailValidated: true, rol, allowedApps: ["ADMIN_WEB"],
        parkings: { create: parkings.map((proyectoId) => ({ proyectoId })) },
        appPermissions: { create: { app: "ADMIN_WEB", permissionProfileId: profileId } } } });
      users.push(user.id);
      tokens[key] = String(await JwtPlugin.generateToken({ id: user.id, app: "ADMIN_WEB" }));
    }
    const app = express(); app.use(express.json()); app.use(AppRoutes.routes);
    server = app.listen(0, "127.0.0.1"); await new Promise<void>((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });

  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    await db().usuario.deleteMany({ where: { id: { in: users } } });
    await db().permissionProfile.deleteMany({ where: { id: profileId } });
    await db().proyecto.deleteMany({ where: { id: { in: [...Object.values(projects), ...created] } } });
    await PostgresDatabase.disconnect();
  });

  it("lists only the user's parkings, with filters, search and pagination", async () => {
    const mine = await call("GET", "/");
    expect(mine.status).toBe(200);
    expect(mine.body.proyectos.map((item: { id: string }) => item.id)).toEqual([projects.own]);

    const search = encodeURIComponent(tag);
    const all = await call("GET", `/?search=${search}`, undefined, tokens.super);
    expect(all.body.proyectos.map((item: { id: string }) => item.id).sort()).toEqual([projects.own, projects.other].sort());
    // Search and city ignore accents and case.
    expect((await call("GET", `/?search=nunoa`)).body.proyectos).toHaveLength(1);
    expect((await call("GET", `/?ciudad=MONTERREY&search=${search}`, undefined, tokens.super)).body.proyectos.map((item: { id: string }) => item.id)).toEqual([projects.other]);
    expect((await call("GET", `/?estado=false&search=${search}`, undefined, tokens.super)).body.proyectos.map((item: { id: string }) => item.id)).toEqual([projects.other]);
    expect((await call("GET", `/?estado=0&search=${search}`, undefined, tokens.super)).body.proyectos).toHaveLength(1);
    expect(await call("GET", "/?estado=quizas")).toMatchObject({ status: 400, body: { error: "'estado' debe ser boolean" } });

    const paged = await call("GET", `/?search=${search}&page=1&limit=1`, undefined, tokens.super);
    expect(paged.body).toMatchObject({ total: 2, page: 1, limit: 1, totalPages: 2 });
    expect(paged.body.proyectos).toHaveLength(1);
  });

  it("reads, updates and changes the state only of the user's parkings", async () => {
    expect((await call("GET", `/${projects.own}`)).body.proyecto.id).toBe(projects.own);
    expect((await call("GET", `/${projects.other}`)).status).toBe(403);
    expect((await call("GET", `/${randomUUID()}`, undefined, tokens.super)).status).toBe(404);

    const updated = await call("PATCH", `/${projects.own}`, { descripcion: "Nivel -1", capacidad: "80" });
    expect(updated).toMatchObject({ status: 200, body: { proyecto: { descripcion: "Nivel -1", capacidad: 80 } } });
    expect((await call("PATCH", `/${projects.own}`, { capacidad: "0" })).status).toBe(400);
    expect((await call("PATCH", `/${projects.other}`, { descripcion: "x" })).status).toBe(403);

    expect((await call("PATCH", `/${projects.own}/status`, { estado: false })).body.proyecto.estado).toBe(false);
    expect(await call("PATCH", `/${projects.own}/status`, { estado: "no" })).toMatchObject({ status: 400, body: { error: "'estado' debe ser boolean" } });
    expect((await call("PATCH", `/${projects.other}/status`, { estado: true })).status).toBe(403);
    await call("PATCH", `/${projects.own}/status`, { estado: true });
  });

  it("serves the rate and the installation link token only of the user's parkings", async () => {
    expect(await call("GET", `/${projects.own}/tarifa`)).toMatchObject({ status: 200, body: { tarifa: null, historial: [] } });
    expect((await call("GET", `/${projects.other}/tarifa`)).status).toBe(403);
    // Only the hash of the old token is kept: it cannot be shown again, only regenerated.
    expect((await call("GET", `/${projects.own}/installation-link-token`)).status).toBe(400);
    const regenerated = await call("POST", `/${projects.own}/installation-link-token`);
    expect(regenerated.status).toBe(200);
    expect((await call("GET", `/${projects.own}/installation-link-token`)).status).toBe(200);
    expect((await call("POST", `/${projects.other}/installation-link-token`)).status).toBe(403);
  });

  it("creates and deletes parkings", async () => {
    const body = { nombre: `Nueva ${tag}`, descripcion: "Prueba", ciudad: "León", estado: "true", coordinates: "[-101.68, 21.12]", capacidad: "50" };
    const made = await call("POST", "/", body);
    expect(made.status).toBe(201);
    const id = made.body.proyecto?.id ?? made.body.id;
    created.push(id);
    expect((await call("POST", "/", { ...body, descripcion: "" })).status).toBe(400);
    // Deleting is for SUPER only.
    expect((await call("DELETE", `/${id}`)).status).toBe(403);
    expect((await call("DELETE", `/${id}`, undefined, tokens.super)).status).toBe(200);
    expect((await call("GET", `/${id}`, undefined, tokens.super)).status).toBe(404);
  });
});
