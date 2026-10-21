import express from "express";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { JwtPlugin } from "../../src/config/plugins/jwt.plugin";
import { PostgresDatabase } from "../../src/data/postgres";
import { AppRoutes } from "../../src/presentation/routes/routes";

// /api/modulos: the device catalog of each parking, limited to the parkings the user sees.
const db = () => PostgresDatabase.client;
const tag = `mod-${randomUUID().slice(0, 8)}`;
const projects = { own: "", other: "" };
let server: Server;
let base = "";
const tokens = { super: "", scoped: "" };
const users: string[] = [];
let profileId = "";

const call = async (method: string, path: string, body?: unknown, token = tokens.scoped) => {
  const response = await fetch(`${base}/api/modulos${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json() as Record<string, any> };
};
const modulo = (proyecto: string, extra: Record<string, unknown> = {}) =>
  ({ nombre: `Entrada ${randomUUID().slice(0, 4)}`, proyecto, tipo: "ENTRADA", identificador: `${tag}-${randomUUID()}`, ...extra });

describe("/api/modulos", () => {
  beforeAll(async () => {
    await PostgresDatabase.connect({ databaseUrl: process.env.DATABASE_URL!, poolMax: 4 });
    projects.own = (await db().proyecto.create({ data: { nombre: `Propia ${tag}`, ciudad: "GDL", identificador: `${tag}-own`, coordinates: [0, 0] } })).id;
    projects.other = (await db().proyecto.create({ data: { nombre: `Otra ${tag}`, ciudad: "GDL", identificador: `${tag}-other`, coordinates: [0, 0] } })).id;
    profileId = (await db().permissionProfile.create({ data: { app: "ADMIN_WEB", nombre: tag, modules: ["modules"] } })).id;
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
    await db().modulo.deleteMany({ where: { proyectoId: { in: Object.values(projects) } } });
    await db().usuario.deleteMany({ where: { id: { in: users } } });
    await db().permissionProfile.deleteMany({ where: { id: profileId } });
    await db().proyecto.deleteMany({ where: { id: { in: Object.values(projects) } } });
    await PostgresDatabase.disconnect();
  });

  it("creates modules only in the user's parkings", async () => {
    const created = await call("POST", "/", modulo(projects.own, { ip: "10.0.0.7", descripcion: "Pluma norte" }));
    expect(created).toMatchObject({ status: 201, body: { modulo: { proyecto: projects.own, tipo: "ENTRADA", estado: true, ip: "10.0.0.7" } } });
    expect(Object.keys(created.body.modulo)).toContain("submodulos");
    expect(await call("POST", "/", modulo(projects.other))).toMatchObject({ status: 403, body: { error: "Forbidden" } });
    expect(await call("POST", "/", { ...modulo(projects.own), nombre: "" })).toMatchObject({ status: 400, body: { error: "'nombre' es requerido" } });
  });

  it("lists with filters, search and pagination, only from the user's parkings", async () => {
    await call("POST", "/", modulo(projects.own, { tipo: "SALIDA", nombre: "Salida Ñandú" }));
    await call("POST", "/", modulo(projects.other, { nombre: "Ajena" }), tokens.super);

    const mine = await call("GET", "/");
    expect(mine.status).toBe(200);
    expect(mine.body.modulos.every((item: { proyecto: string }) => item.proyecto === projects.own)).toBe(true);
    expect((await call("GET", `/?proyecto=${projects.other}`)).status).toBe(403);

    const all = await call("GET", `/?search=${encodeURIComponent(tag)}`, undefined, tokens.super);
    expect(all.body.modulos.length).toBeGreaterThanOrEqual(3);
    // Search ignores accents and case.
    expect((await call("GET", "/?search=nandu")).body.modulos.map((item: { nombre: string }) => item.nombre)).toEqual(["Salida Ñandú"]);
    const exits = await call("GET", `/?proyecto=${projects.own}&tipos=SALIDA`);
    expect(exits.body.modulos.map((item: { tipo: string }) => item.tipo)).toEqual(["SALIDA"]);
    const both = await call("GET", `/?proyecto=${projects.own}&tipos=ENTRADA,SALIDA`);
    expect(both.body.modulos).toHaveLength(2);
    expect(await call("GET", "/?tipo=NAVE")).toMatchObject({ status: 400, body: { error: "'tipo' no es valido" } });
    expect(await call("GET", "/?estado=quizas")).toMatchObject({ status: 400, body: { error: "'estado' debe ser boolean" } });

    const paged = await call("GET", `/?proyecto=${projects.own}&page=1&limit=1`);
    expect(paged.status).toBe(200);
    expect(paged.body.modulos).toHaveLength(1);
    expect(paged.body.total).toBe(2);
  });

  it("reads, updates and changes the state of a module of the user's parking", async () => {
    const created = (await call("POST", "/", modulo(projects.own))).body.modulo;
    const foreign = (await call("POST", "/", modulo(projects.other), tokens.super)).body.modulo;
    expect((await call("GET", `/${created.id}`)).body.modulo.id).toBe(created.id);
    expect((await call("GET", `/identificador/${created.identificador}`)).body.modulo.id).toBe(created.id);
    expect((await call("GET", `/proyecto/${projects.own}`)).body.modulos.length).toBeGreaterThan(0);
    for (const path of [`/${foreign.id}`, `/identificador/${foreign.identificador}`, `/proyecto/${projects.other}`]) {
      expect((await call("GET", path)).status).toBe(403);
    }

    expect((await call("PATCH", `/${created.id}`, { nombre: "Renombrada" })).body.modulo.nombre).toBe("Renombrada");
    // Moving it to a parking the user cannot see.
    expect((await call("PATCH", `/${created.id}`, { proyecto: projects.other })).status).toBe(403);
    expect((await call("PATCH", `/${foreign.id}`, { nombre: "x" })).status).toBe(403);
    expect((await call("PATCH", `/${created.id}/status`, { estado: false })).body.modulo.estado).toBe(false);
    expect(await call("PATCH", `/${created.id}/status`, { estado: "no" })).toMatchObject({ status: 400, body: { error: "'estado' debe ser boolean" } });
    expect((await call("GET", `/?proyecto=${projects.own}&estado=false`)).body.modulos.map((item: { id: string }) => item.id)).toEqual([created.id]);
  });

  it("manages submodules and deletion", async () => {
    const created = (await call("POST", "/", modulo(projects.own))).body.modulo;
    const foreign = (await call("POST", "/", modulo(projects.other), tokens.super)).body.modulo;
    const sub = await call("POST", `/${created.id}/submodulos`, { nombre: "Lector", tipo: "QR_SCANNER" });
    expect(sub.status).toBe(201);
    const submoduloId = sub.body.submodulo.submoduloId;
    expect((await call("GET", `/${created.id}/submodulos`)).body.submodulos).toHaveLength(1);
    expect((await call("PATCH", `/${created.id}/submodulos/${submoduloId}`, { nombre: "Lector 2", tipo: "QR_SCANNER" })).body.submodulo.nombre).toBe("Lector 2");
    expect((await call("POST", `/${created.id}/submodulos`, { tipo: "QR_SCANNER" })).status).toBe(400);
    expect((await call("GET", `/${foreign.id}/submodulos`)).status).toBe(403);

    // Deleting is for SUPER only.
    expect((await call("DELETE", `/${created.id}/submodulos/${submoduloId}`)).status).toBe(403);
    expect((await call("DELETE", `/${created.id}/submodulos/${submoduloId}`, undefined, tokens.super)).body.modulo.submodulos).toHaveLength(0);
    expect((await call("DELETE", `/${created.id}`, undefined, tokens.super)).status).toBe(200);
    expect((await call("GET", `/${created.id}`, undefined, tokens.super)).status).toBe(404);
  });
});
