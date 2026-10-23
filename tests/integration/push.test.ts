import express from "express";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { JwtPlugin } from "../../src/config/plugins/jwt.plugin";
import { PostgresDatabase } from "../../src/data/postgres";
import { PushPostgresDatasource } from "../../src/infrastructure/datasources/push/push.datasource.postgres";
import { AppRoutes } from "../../src/presentation/routes/routes";

// REFACTO#65: who receives the notices of a parking, and the subscription endpoints.
const db = () => PostgresDatabase.client;
const tag = `push-${randomUUID().slice(0, 8)}`;
const projects = { a: "", b: "" };
const users: Record<string, string> = {};
const tokens: Record<string, string> = {};
const profiles: string[] = [];
let server: Server;
let base = "";

const endpointOf = (key: string) => `https://push.example/${tag}/${key}`;
const keys = { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" };
const call = async (method: string, path: string, token: string, body?: unknown) => {
  const response = await fetch(`${base}/api/push${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
};

describe("push notices", () => {
  beforeAll(async () => {
    await PostgresDatabase.connect({ databaseUrl: process.env.DATABASE_URL!, poolMax: 4 });
    for (const key of ["a", "b"] as const) {
      projects[key] = (await db().proyecto.create({ data: { nombre: `${key.toUpperCase()} ${tag}`, ciudad: "CDMX", identificador: `${tag}-${key}`, coordinates: [0, 0] } })).id;
    }
    // Who may hear about parking A, and who may not.
    const people: Array<[string, string, string[], string[], { estado?: boolean; apps?: Array<"ADMIN_WEB" | "OPERATIVE_WEB"> }]> = [
      ["super", "SUPER_ROLE", ["projects"], [], {}],
      ["installer", "ADMIN_ROLE", ["installations"], [projects.a], {}],
      ["muted", "ADMIN_ROLE", ["projects"], [projects.a], {}],
      ["otherparking", "ADMIN_ROLE", ["projects"], [projects.b], {}],
      ["nomodule", "ADMIN_ROLE", ["payments"], [projects.a], {}],
      ["inactive", "ADMIN_ROLE", ["projects"], [projects.a], { estado: false }],
    ];
    for (const [key, rol, modules, parkings, extra] of people) {
      const profile = await db().permissionProfile.create({ data: { app: "ADMIN_WEB", nombre: `${tag}-${key}`, modules: modules as never } });
      profiles.push(profile.id);
      const user = await db().usuario.create({ data: {
        nombre: key, apellido: tag, correo: `${key}-${tag}@example.test`, telefono: `${key}${tag}`.slice(0, 20),
        password: "unused", emailValidated: true, rol, allowedApps: extra.apps ?? ["ADMIN_WEB"], estado: extra.estado ?? true,
        parkings: { create: parkings.map((proyectoId) => ({ proyectoId })) },
        appPermissions: { create: { app: "ADMIN_WEB", permissionProfileId: profile.id } },
      } });
      users[key] = user.id;
      tokens[key] = String(await JwtPlugin.generateToken({ id: user.id, app: "ADMIN_WEB" }));
      await db().pushSubscription.create({ data: { usuarioId: user.id, endpoint: endpointOf(key), ...keys } });
    }
    await db().pushMutedProject.create({ data: { usuarioId: users.muted!, proyectoId: projects.a } });

    const app = express(); app.use(express.json()); app.use(AppRoutes.routes);
    server = app.listen(0, "127.0.0.1"); await new Promise<void>((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });

  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    await db().usuario.deleteMany({ where: { id: { in: Object.values(users) } } });
    await db().permissionProfile.deleteMany({ where: { id: { in: profiles } } });
    await db().proyecto.deleteMany({ where: { id: { in: Object.values(projects) } } });
    await PostgresDatabase.disconnect();
  });

  it("notifies only active ADMIN users who can see the parking and did not mute it", async () => {
    const targets = await new PushPostgresDatasource().targetsForProject(projects.a);
    const ours = targets.map((target) => target.endpoint).filter((endpoint) => endpoint.includes(tag)).sort();
    expect(ours).toEqual([endpointOf("installer"), endpointOf("super")].sort());
  });

  it("removes dead subscriptions and keeps the rest", async () => {
    const datasource = new PushPostgresDatasource();
    await datasource.removeEndpoints([endpointOf("super")]);
    await datasource.markDelivered([endpointOf("installer")], Date.now());
    expect(await db().pushSubscription.findUnique({ where: { endpoint: endpointOf("super") } })).toBeNull();
    expect((await db().pushSubscription.findUnique({ where: { endpoint: endpointOf("installer") } }))?.lastSuccessAt).not.toBeNull();
  });

  it("tells whether notices are configured, and lists and changes the user's preferences", async () => {
    const config = await call("GET", "/config", tokens.installer!);
    expect(config.status).toBe(200);
    expect(typeof config.body.enabled).toBe("boolean");

    const prefs = await call("GET", "/preferencias", tokens.muted!);
    expect(prefs.body.proyectos).toEqual([{ proyectoId: projects.a, nombre: `A ${tag}`, activo: false }]);
    expect((await call("PUT", `/preferencias/${projects.a}`, tokens.muted!, { activo: true })).status).toBe(200);
    expect(await db().pushMutedProject.count({ where: { usuarioId: users.muted! } })).toBe(0);
    expect((await call("PUT", `/preferencias/${projects.b}`, tokens.muted!, { activo: false })).status).toBe(403);
    expect((await call("GET", "/preferencias", tokens.nomodule!)).status).toBe(403);
  });

  it("removes only the user's own subscription", async () => {
    expect((await call("DELETE", "/suscripciones", tokens.installer!, { endpoint: endpointOf("otherparking") })).body).toEqual({ removed: false });
    expect((await call("DELETE", "/suscripciones", tokens.installer!, { endpoint: endpointOf("installer") })).body).toEqual({ removed: true });
  });
});
