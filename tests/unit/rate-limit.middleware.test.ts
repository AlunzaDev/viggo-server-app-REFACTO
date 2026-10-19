import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { failedAuthLimiter, loginAttemptLimiter, rateLimitMiddleware } from "../../src/presentation/middlewares/rate-limit.middleware";

const PASSWORD = "correcta";
const servers: Server[] = [];

/** A login endpoint behind the limiter: 200 with the right password, 401 otherwise. */
const startLogin = async (options: { maxFailuresPerAccount: number; maxFailuresPerIp: number; windowMs?: number }) => {
  const app = express();
  app.use(express.json());
  app.post(
    "/login",
    loginAttemptLimiter({ windowMs: options.windowMs ?? 60_000, accountField: "correo", ...options }),
    (req, res) => {
      if (!req.body?.correo) return res.status(400).json({ error: "correo requerido" });
      return req.body.password === PASSWORD ? res.status(200).json({ ok: true }) : res.status(401).json({ error: "Credenciales incorrectas" });
    },
  );
  const server = app.listen(0);
  servers.push(server);
  await new Promise((resolve) => server.once("listening", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/login`;
  return (correo: string, password: string, headers: Record<string, string> = {}) =>
    fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify({ correo, password }) });
};

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

describe("loginAttemptLimiter", () => {
  it("blocks an account after too many failed attempts, even with the right password", async () => {
    const login = await startLogin({ maxFailuresPerAccount: 3, maxFailuresPerIp: 100 });
    for (let attempt = 0; attempt < 3; attempt += 1) expect((await login("ana@viggo.test", "mal")).status).toBe(401);

    const blocked = await login("ana@viggo.test", PASSWORD);
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    // The account is normalized (case and spaces).
    expect((await login("  ANA@viggo.test ", "mal")).status).toBe(429);
    // Other accounts are not affected.
    expect((await login("beto@viggo.test", PASSWORD)).status).toBe(200);
  });

  it("does not count successful logins, and a success clears earlier failures", async () => {
    const login = await startLogin({ maxFailuresPerAccount: 2, maxFailuresPerIp: 100 });
    for (let attempt = 0; attempt < 10; attempt += 1) expect((await login("ana@viggo.test", PASSWORD)).status).toBe(200);

    expect((await login("ana@viggo.test", "mal")).status).toBe(401);
    expect((await login("ana@viggo.test", PASSWORD)).status).toBe(200);
    expect((await login("ana@viggo.test", "mal")).status).toBe(401);
    expect((await login("ana@viggo.test", PASSWORD)).status).toBe(200);
  });

  it("does not count malformed requests", async () => {
    const login = await startLogin({ maxFailuresPerAccount: 1, maxFailuresPerIp: 1 });
    for (let attempt = 0; attempt < 5; attempt += 1) expect((await login("", "x")).status).toBe(400);
    expect((await login("ana@viggo.test", PASSWORD)).status).toBe(200);
  });

  it("blocks an address that sprays passwords across accounts", async () => {
    const login = await startLogin({ maxFailuresPerAccount: 100, maxFailuresPerIp: 3 });
    for (const correo of ["a@viggo.test", "b@viggo.test", "c@viggo.test"]) expect((await login(correo, "mal")).status).toBe(401);
    expect((await login("d@viggo.test", PASSWORD)).status).toBe(429);
  });

  it("ignores X-Forwarded-For unless trust proxy is configured", async () => {
    const login = await startLogin({ maxFailuresPerAccount: 100, maxFailuresPerIp: 2 });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      expect((await login(`u${attempt}@viggo.test`, "mal", { "X-Forwarded-For": `10.0.0.${attempt}` })).status).toBe(401);
    }
    // A forged header does not give the client a fresh address.
    expect((await login("z@viggo.test", "mal", { "X-Forwarded-For": "10.0.0.99" })).status).toBe(429);
  });

  it("unblocks after the window", async () => {
    const login = await startLogin({ maxFailuresPerAccount: 1, maxFailuresPerIp: 100, windowMs: 200 });
    expect((await login("ana@viggo.test", "mal")).status).toBe(401);
    expect((await login("ana@viggo.test", PASSWORD)).status).toBe(429);
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect((await login("ana@viggo.test", PASSWORD)).status).toBe(200);
  });
});

describe("rateLimitMiddleware", () => {
  it("limits every request per address and ignores forged forwarding headers", async () => {
    const app = express();
    app.post("/forgot", rateLimitMiddleware({ windowMs: 60_000, maxRequests: 2 }), (_req, res) => res.status(204).end());
    const server = app.listen(0);
    servers.push(server);
    await new Promise((resolve) => server.once("listening", resolve));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/forgot`;
    const send = (ip: string) => fetch(url, { method: "POST", headers: { "X-Forwarded-For": ip } });

    expect((await send("1.1.1.1")).status).toBe(204);
    expect((await send("2.2.2.2")).status).toBe(204);
    expect((await send("3.3.3.3")).status).toBe(429);
  });
});

describe("failedAuthLimiter", () => {
  /** Two routes sharing one limiter: 200 with the right token, 401 otherwise. */
  const startLinking = async (maxFailures: number) => {
    const app = express();
    const guesses = failedAuthLimiter({ windowMs: 60_000, maxFailures });
    const check = (req: express.Request, res: express.Response) =>
      req.header("authorization") === "Bearer ok" ? res.status(200).json({ ok: true }) : res.status(401).json({ error: "Token invalido" });
    app.post("/preview", guesses, check);
    app.get("/status", guesses, check);
    const server = app.listen(0);
    servers.push(server);
    await new Promise((resolve) => server.once("listening", resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    return (method: string, path: string, token: string) =>
      fetch(base + path, { method, headers: { Authorization: `Bearer ${token}` } });
  };

  it("blocks an address after too many rejected tokens, across the routes that share it", async () => {
    const call = await startLinking(3);
    expect((await call("POST", "/preview", "guess-1")).status).toBe(401);
    expect((await call("GET", "/status", "guess-2")).status).toBe(401);
    expect((await call("POST", "/preview", "guess-3")).status).toBe(401);

    const blocked = await call("GET", "/status", "ok");
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("never counts requests with a valid token", async () => {
    const call = await startLinking(2);
    for (let attempt = 0; attempt < 20; attempt += 1) expect((await call("GET", "/status", "ok")).status).toBe(200);
    expect((await call("POST", "/preview", "guess")).status).toBe(401);
    expect((await call("GET", "/status", "ok")).status).toBe(200);
  });
});
