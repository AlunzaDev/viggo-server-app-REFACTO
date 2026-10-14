import express from "express";
import { createHash, randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresDatabase } from "../../src/data/postgres";
import { SyncRoutes } from "../../src/presentation/routes/sync/sync.routes";

const db = () => PostgresDatabase.client;
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const tag = randomUUID().slice(0, 8);

const LINK_A = `link-a-${randomUUID()}`;
const LINK_B = `link-b-${randomUUID()}`;
const INSTALLATION_A = `inst-a-${tag}`;
const INSTALLATION_NEW = `inst-new-${tag}`;

let server: Server;
let baseUrl = "";
let proyectoA = "";
let proyectoB = "";
let syncTokenA = "";

const call = async (
  method: string,
  path: string,
  { token, installationId = INSTALLATION_A, body }: { token?: string; installationId?: string; body?: unknown } = {},
) => {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "X-Viggo-Installation-Id": installationId,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
};

const createProject = async (nombre: string, linkToken: string) =>
  (
    await db().proyecto.create({
      data: {
        nombre,
        coordinates: [-103.3, 20.6],
        ciudad: "GDL",
        identificador: `${nombre}-${tag}`,
        installationLinkTokenHash: sha256(linkToken),
        installationLinkTokenEncrypted: "ciphertext",
      },
    })
  ).id;

describe("sync authentication (HTTP)", () => {
  beforeAll(async () => {
    await PostgresDatabase.connect({ databaseUrl: process.env.DATABASE_URL!, poolMax: 3 });
    proyectoA = await createProject("Plaza-A", LINK_A);
    proyectoB = await createProject("Plaza-B", LINK_B);
    await db().usuario.create({
      data: {
        nombre: "Caja",
        apellido: "B",
        correo: `caja-b-${tag}@example.com`,
        telefono: `tel-b-${tag}`,
        password: "hash",
        rol: "ADMIN_ROLE",
        allowedApps: ["OPERATIVE_WEB"],
        parkings: { create: [{ proyectoId: proyectoB }] },
      },
    });

    const app = express();
    app.use(express.json());
    app.use("/api/sync", SyncRoutes.routes);
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/sync`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    await db().localInstallation.deleteMany({ where: { installationId: { in: [INSTALLATION_A, INSTALLATION_NEW] } } });
    await db().usuario.deleteMany({ where: { correo: `caja-b-${tag}@example.com` } });
    await db().proyecto.deleteMany({ where: { id: { in: [proyectoA, proyectoB] } } });
    await PostgresDatabase.disconnect();
  });

  it("links an installation with the project's link token and hands it its own sync token", async () => {
    expect((await call("POST", "/installation-link/preview", { token: "wrong" })).status).toBe(401);
    const preview = await call("POST", "/installation-link/preview", { token: LINK_A });
    expect(preview.body.proyecto).toMatchObject({ id: proyectoA, nombre: "Plaza-A" });

    // The project comes from the token, whatever the body says.
    const requested = await call("POST", "/installation-requests", {
      token: LINK_A,
      body: { proyectoId: proyectoB, localApiBaseUrl: "http://10.0.0.5:3002" },
    });
    expect(requested.status).toBe(202);
    expect(requested.body.request).toMatchObject({ proyectoId: proyectoA, status: "pending" });

    const pending = await call("GET", "/installation-request/status", { token: LINK_A });
    expect(pending.body).toMatchObject({ oneTimeSyncToken: null, request: { status: "pending" } });
    // The other project's link token does not see this request.
    expect((await call("GET", "/installation-request/status", { token: LINK_B })).body.request).toBeUndefined();

    await db().localInstallation.update({ where: { installationId: INSTALLATION_A }, data: { status: "approved" } });
    const approved = await call("GET", "/installation-request/status", { token: LINK_A });
    expect(approved.body.proyecto._id).toBe(proyectoA);
    syncTokenA = approved.body.oneTimeSyncToken;
    expect(syncTokenA).toBeTruthy();
  });

  it("serves only the installation's own project", async () => {
    const token = syncTokenA;
    expect((await call("GET", `/configuration/${proyectoA}`, { token })).status).toBe(200);
    expect((await call("GET", `/access-snapshot/${proyectoA}`, { token })).status).toBe(200);

    for (const path of [`/configuration/${proyectoB}`, `/access-snapshot/${proyectoB}`]) {
      const response = await call("GET", path, { token });
      expect(response.status).toBe(403);
      expect(response.body.code).toBe("SYNC_PROJECT_MISMATCH");
    }
    // A user of project B cannot be looked up from project A's installation.
    const lookup = await call("GET", `/access-user/by-correo/${encodeURIComponent(`caja-b-${tag}@example.com`)}?app=OPERATIVE_WEB`, { token });
    expect(lookup.status).toBe(404);

    const event = { eventId: randomUUID(), proyectoId: proyectoB, eventType: "ticket.created", aggregateId: randomUUID(), occurredAt: Date.now(), payload: {} };
    expect((await call("POST", "/events", { token, body: event })).status).toBe(403);
    const heartbeat = { proyectoId: proyectoB, generatedAt: Date.now(), summary: {}, modules: [] };
    expect((await call("POST", "/heartbeat-snapshot", { token, body: heartbeat })).status).toBe(403);
  });

  it("rejects every credential that is not the installation's own token", async () => {
    const path = `/configuration/${proyectoA}`;
    expect((await call("GET", path)).status).toBe(401);
    // The old shared service token no longer opens the sync API.
    expect((await call("GET", path, { token: process.env.SYNC_SERVICE_TOKEN || "test-sync-token" })).status).toBe(401);
    // The project's link token only works for linking.
    expect((await call("GET", path, { token: LINK_A })).status).toBe(401);
    // A token is bound to its installation id.
    expect((await call("GET", path, { token: syncTokenA, installationId: INSTALLATION_NEW })).status).toBe(401);
    expect((await call("GET", path, { token: syncTokenA, installationId: "" })).status).toBe(400);
  });

  it("stops accepting the token when the installation is unlinked", async () => {
    await db().localInstallation.update({ where: { installationId: INSTALLATION_A }, data: { status: "pending" } });
    expect((await call("GET", `/configuration/${proyectoA}`, { token: syncTokenA })).status).toBe(401);
  });
});
