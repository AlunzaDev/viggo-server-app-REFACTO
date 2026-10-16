/** Issue #11: real HTTP + real PostgreSQL, exclusively in newly created disposable databases. */
import { promisify } from "node:util";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn, execFileSync, execFile } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, request as httpRequest } from "node:http";
import { once } from "node:events";
import { Client } from "pg";
import { hashSync } from "bcryptjs";
import jwt from "jsonwebtoken";
import { parse } from "dotenv";

const execFileAsync = promisify(execFile);
const adminDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspace = resolve(adminDir, "../..");
const localDir = resolve(workspace, "OPERATIVO/viggo-server-api-OPERATIVA");
const runId = Date.now().toString(36);
const password = `Smoke-${randomUUID()}`;
const secret = `smoke-secret-${randomUUID()}`;
const email = "postgres-smoke@example.test";
const mobileEmail = "mobile-smoke@example.test";
const mobileUserId = randomUUID();
const userId = randomUUID();
const installationId = `smoke-${runId}`;
const children = [];
const databases = [];
const steps = [];
const logs = [];
const clients = [];
let cloudOnline = true;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const step = async (name, action) => {
  const started = Date.now();
  const value = await action();
  steps.push({ name, status: "passed", ms: Date.now() - started });
  console.log(`OK ${name}`);
  return value;
};
const listen = async server => { server.listen(0, "127.0.0.1"); await once(server, "listening"); return server.address().port; };
const freePort = async () => { const server = createServer(); const port = await listen(server); await new Promise(r => server.close(r)); return port; };
const waitFor = async (action, label, timeout = 60_000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await action()) return; await pause(250); }
  throw new Error(`Timeout: ${label}`);
};
const call = async (base, path, token, body, method = body ? "POST" : "GET", headers = {}) => {
  const response = await fetch(base + path, {
    method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(25_000),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`${method} ${path}: HTTP ${response.status}: ${JSON.stringify(data)}`);
  return data;
};
const createDatabase = async (directory, name) => {
  const testEnv = parse(readFileSync(resolve(directory, ".env.test")));
  const source = new URL(testEnv.DATABASE_URL);
  assert(["localhost", "127.0.0.1"].includes(source.hostname), "Only loopback PostgreSQL is allowed");
  assert(source.pathname.endsWith("_test"), "Source configuration must be a test database");
  assert(/^viggo_smoke_[a-z0-9_]+_test$/.test(name));
  const controlUrl = new URL(source); controlUrl.pathname = "/postgres";
  const control = new Client({ connectionString: controlUrl.href }); await control.connect();
  try { await control.query(`CREATE DATABASE "${name}"`); }
  finally { await control.end(); }
  databases.push({ controlUrl: controlUrl.href, name });
  source.pathname = `/${name}`;
  execFileSync(process.execPath, [resolve(directory, "node_modules/prisma/build/index.js"), "migrate", "deploy"], {
    cwd: directory, env: { ...process.env, APP_ENV: "test", DATABASE_URL: source.href }, stdio: "pipe",
  });
  const db = new Client({ connectionString: source.href }); await db.connect(); clients.push(db);
  return { url: source.href, db };
};
const launch = (directory, url, port, adminUrl) => {
  const child = spawn(process.execPath, ["--import", "tsx", "src/app.ts"], {
    cwd: directory, windowsHide: true, env: { ...process.env,
      APP_ENV: "test", PROD: "false", DATABASE_URL: url, PORT: String(port), HOST: "127.0.0.1", PUBLIC_PATH: "public",
      JWT_SEED: secret, SYNC_SERVICE_TOKEN: secret, INSTALLATION_LINK_TOKEN_SECRET: secret,
      ADMINISTRATIVO_API_URL: adminUrl, WEB_SERVICE_URL: `http://127.0.0.1:${port}`,
      INSTALLATION_ID: installationId, PROJECT_ID: "", AUTO_CONFIG_SYNC_ENABLED: "false",
      MOBILE_COMMANDS_SYNC_ENABLED: "true", MOBILE_COMMANDS_SYNC_INTERVAL_MS: "2000", MOBILE_COMMANDS_SYNC_START_DELAY_MS: "0",
      OUTBOX_SYNC_ENABLED: "true", OUTBOX_SYNC_INTERVAL_MS: "1000", BARRIER_SOCKET_REQUIRED: "false",
      FINANCIAL_RECONCILIATION_WORKER_ENABLED: "false", STRIPE_ENABLED: "false", STRIPE_MOCK_ENABLED: "true",
    }, stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  child.stdout.on("data", chunk => logs.push(String(chunk))); child.stderr.on("data", chunk => logs.push(String(chunk)));
  return child;
};

const proxy = createServer((req, res) => {
  if (!cloudOnline) { res.writeHead(503); res.end('{"error":"simulated cloud outage"}'); return; }
  const upstream = httpRequest(adminUrl + req.url, { method: req.method, headers: req.headers }, incoming => {
    res.writeHead(incoming.statusCode, incoming.headers); incoming.pipe(res);
  });
  upstream.on("error", () => { res.writeHead(502); res.end('{}'); }); req.pipe(upstream);
});
let adminUrl;
let localUrl;
let admin;
let local;
let projectId;
let entryId;
let exitId;
let posId;
let moduleToken;
let exitToken;
let adminToken;
let localToken;
const id = value => value?.id ?? value?.uid ?? value?._id;
const uuid = value => { assert.match(value, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i); return value; };
try {
  admin = await createDatabase(adminDir, `viggo_smoke_admin_${runId}_test`);
  local = await createDatabase(localDir, `viggo_smoke_local_${runId}_test`);
  for (const db of [admin.db, local.db]) await db.query(`INSERT INTO usuarios
    (id,nombre,apellido,correo,telefono,password,rol,email_validated,allowed_apps,updated_at)
    VALUES ($1,'Smoke','Postgres',$2,'5500000000',$3,'SUPER_ROLE',true,ARRAY['ADMIN_WEB','OPERATIVE_WEB','OPERATIVE_MOBILE']::user_app[],now())`, [userId, email, hashSync(password, 10)]);
  for (const [app, modules] of Object.entries({
    ADMIN_WEB: ["users","permissionProfiles","installations","projects","modules","pensions","pensionPasses","payments"],
    OPERATIVE_WEB: ["cashPayments","modules","pensions","pensionPasses","tickets","pensionMoves","payments"],
    OPERATIVE_MOBILE: ["cashPayments","modules","pensions","pensionPasses","tickets","pensionMoves","payments"],
  })) {
    const profileId = randomUUID();
    for (const db of [admin.db, local.db]) {
      await db.query("INSERT INTO permission_profiles (id,app,nombre,modules,updated_at) VALUES ($1,$2,$3,$4::user_module[],now())",[profileId,app,`Smoke ${app}`,modules]);
      await db.query("INSERT INTO usuario_app_permissions (usuario_id,app,permission_profile_id) VALUES ($1,$2,$3)",[userId,app,profileId]);
    }
  }
  adminUrl = `http://127.0.0.1:${await freePort()}`;
  localUrl = `http://127.0.0.1:${await freePort()}`;
  const proxyUrl = `http://127.0.0.1:${await listen(proxy)}`;
  launch(adminDir, admin.url, new URL(adminUrl).port, adminUrl);
  launch(localDir, local.url, new URL(localUrl).port, proxyUrl);
  await step("both PostgreSQL backends ready", async () => {
    await waitFor(async () => {
      if (children.some(child => child.exitCode !== null || child.signalCode !== null)) throw new Error("A backend exited during startup");
      try { await call(adminUrl, "/api/ping"); await call(localUrl, "/api/ping"); return true; } catch { return false; }
    }, "backend startup");
  });
  adminToken = (await step("administrative web login", () => call(adminUrl, "/api/auth/login-correo", null, { correo: email, password, app: "ADMIN_WEB" }))).token;
  projectId = uuid(id((await step("create project with UUID", () => call(adminUrl, "/api/proyectos", adminToken, { nombre: "Postgres Smoke", ciudad: "CDMX", coordinates: [-99,19], identificador: `smoke-${runId}`, estado: true }))).proyecto));
  for (const tipo of ["ENTRADA", "SALIDA", "POS"]) {
    const result = await step(`create ${tipo} module`, () => call(adminUrl, "/api/modulos", adminToken, { nombre: tipo, proyecto: projectId, tipo, identificador: `smoke-${runId}-${tipo}`, estado: true }));
    const moduloId = uuid(id(result.modulo));
    if (tipo === "ENTRADA") entryId = moduloId; else if (tipo === "SALIDA") exitId = moduloId; else posId = moduloId;
  }
  const profileId = randomUUID();
  await admin.db.query(`INSERT INTO permission_profiles (id,app,nombre,modules,updated_at)
    VALUES ($1,'OPERATIVE_MOBILE','Smoke Mobile',ARRAY['modules','pensions','pensionPasses','tickets','payments']::user_module[],now())`, [profileId]);
  await admin.db.query(`INSERT INTO usuarios (id,nombre,apellido,correo,telefono,password,rol,email_validated,allowed_apps,updated_at)
    VALUES ($1,'Mobile','Client',$2,'5500000001',$3,'CLIENT_ROLE',true,ARRAY['OPERATIVE_MOBILE']::user_app[],now())`, [mobileUserId,mobileEmail,hashSync(password,10)]);
  await admin.db.query("INSERT INTO usuario_parkings (usuario_id,proyecto_id) VALUES ($1,$2)",[mobileUserId,projectId]);
  await admin.db.query("INSERT INTO usuario_app_permissions (usuario_id,app,permission_profile_id) VALUES ($1,'OPERATIVE_MOBILE',$2)",[mobileUserId,profileId]);
  const link = await call(adminUrl, `/api/proyectos/${projectId}/installation-link-token`, adminToken);
  const installationLinkToken = link.installationLinkToken ?? link.token;
  await step("preview installation link (project comes from the token)", async () => {
    // Linking happens before anyone can log in: the link token is the authorization.
    const preview = await call(localUrl, "/api/installation/link-preview", null, { installationLinkToken });
    assert.equal(preview.proyecto.id, projectId);
  });
  await step("request installation link", () => call(localUrl, "/api/installation/project-request", null, { installationLinkToken }));
  const requests = await call(adminUrl, "/api/installations", adminToken);
  const pending = requests.requests.find(row => row.installationId === installationId);
  assert(pending, "installation request exists");
  await step("approve installation", () => call(adminUrl, `/api/installations/${id(pending)}/approve`, adminToken, { note: "Postgres smoke" }, "PATCH"));
  await step("installation receives its own sync token", async () => {
    assert.equal((await call(localUrl, "/api/installation/status", null)).installation.status, "linked");
    const relink = await fetch(localUrl + "/api/installation/link-preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ installationLinkToken }) });
    assert.equal(relink.status, 401, "linking endpoints require a session once linked");
  });
  localToken = (await step("operative web login", () => call(localUrl, "/api/auth/login-correo", null, { correo: email, password, app: "OPERATIVE_WEB" }))).token;
  await step("sync configuration and access", () => call(localUrl, "/api/config/sync-now", localToken, {}));
  assert.equal((await call(localUrl, "/api/installation/status", localToken)).installation.proyectoId, projectId);
  moduleToken = jwt.sign({ id: entryId }, secret, { expiresIn: "1h" });
  exitToken = jwt.sign({ id: exitId }, secret, { expiresIn: "1h" });
  const mobileToken = (await step("mobile login", () => call(adminUrl, "/api/auth/login-correo", null, { correo: mobileEmail, password, app: "OPERATIVE_MOBILE" }))).token;
  await step("mobile catalogs scoped to assigned project; administrative writes denied", async () => {
    const catalog = await call(adminUrl, "/api/mobile/proyectos", mobileToken);
    assert.deepEqual(catalog.proyectos.map(id), [projectId]);
    const forbidden = await fetch(adminUrl+"/api/proyectos", { method:"POST", headers:{Authorization:`Bearer ${mobileToken}`,"Content-Type":"application/json"},body:"{}" });
    assert.equal(forbidden.status,403);
    const other = await fetch(adminUrl+`/api/mobile/proyectos/${randomUUID()}`, {headers:{Authorization:`Bearer ${mobileToken}`}});
    assert.equal(other.status,403);
  });
  await waitFor(async () => Number((await admin.db.query("SELECT extract(epoch from last_command_poll_at)*1000 AS last FROM local_installations WHERE installation_id=$1", [installationId])).rows[0]?.last) > Date.now()-8000, "mobile command poll");
  const mobile = await step("mobile entry command", () => call(adminUrl, "/api/mobile/tickets", mobileToken, { moduleToken }, "POST", { "Idempotency-Key": randomUUID() }));
  let completed;
  await waitFor(async () => { completed = (await call(adminUrl, `/api/mobile/operations/${mobile.operation.operationId}`, mobileToken)).operation; if (completed.status === "failed") throw new Error(completed.error); return completed.status === "completed"; }, "mobile ticket");
  const mobileTicket = completed.result.ticket;
  const mobileTicketId = uuid(mobileTicket.ticketId ?? id(mobileTicket));
  const intent = await step("mobile payment intent (mock provider)", () => call(adminUrl, `/api/mobile/tickets/${mobileTicketId}/payment-intent`, mobileToken, {}, "POST", { "Idempotency-Key": randomUUID() }));
  await step("apply mobile payment locally", () => call(adminUrl, `/api/mobile/tickets/${mobileTicketId}/confirm`, mobileToken, { paymentIntentId: intent.paymentIntent.id }));
  assert.equal((await call(localUrl, `/api/tickets/${mobileTicketId}`, localToken)).ticket.pagado, true);
  await step("mobile exit", () => call(adminUrl, "/api/mobile/tickets/exit", mobileToken, { moduleToken: exitToken }, "POST", { "Idempotency-Key": randomUUID() }));
  const pension = (await step("create pension plan", () => call(adminUrl, "/api/pensiones", adminToken, { nombre: "Smoke Pension", proyecto: projectId, precio: 100, estado: true, validez: Array.from({length:7},(_,weekDay)=>({weekDay,from:[0,0],to:[23,59]})) }))).pension;
  const pass = (await call(adminUrl, "/api/pension-pass", adminToken, { name: "Smoke Pass", pension: id(pension), idPass: `smoke-pass-${runId}`, vigent: false, antiPassback: true, inParking: false, estado: true, created: Date.now(), from: -1, to: -1 })).pensionPass;
  await call(adminUrl, "/api/mobile/pension-pass/precontract", mobileToken, { pensionId: id(pension), contractMonths: 1 }, "POST", { "Idempotency-Key": randomUUID() });
  const pensionIntent = await call(adminUrl, "/api/mobile/stripe/payment-intents", mobileToken, { pensionPassId: id(pass), operation: "contract", contractMonths: 1 }, "POST", { "Idempotency-Key": randomUUID() });
  await step("contract pension", () => call(adminUrl, `/api/mobile/pension-pass/${id(pass)}/contract`, mobileToken, { contractMonths: 1, paymentIntentId: pensionIntent.paymentIntentId }, "PATCH", { "Idempotency-Key": randomUUID() }));
  await call(localUrl, "/api/config/sync-now", localToken, {});
  await waitFor(async () => (await local.db.query("SELECT count(*)::int AS n FROM outbox_events WHERE sent_at IS NULL")).rows[0].n === 0, "online outbox drain");
  const beforeOutage = (await admin.db.query("SELECT count(*)::int AS n FROM inbox_events")).rows[0].n;
  cloudOnline = false;
  await step("cashier login with cloud unreachable", async () => {
    localToken = (await call(localUrl, "/api/auth/login-correo", null, { correo: email, password, app: "OPERATIVE_WEB" })).token;
    assert(localToken);
  });
  const entryKey = randomUUID();
  const offlineTicket = (await step("issue ticket while offline", () => call(localUrl, "/api/tickets/createTicket", localToken, { moduleToken }, "POST", { "Idempotency-Key": entryKey }))).ticket;
  await step("retried entry returns the same ticket", async () => {
    const retried = (await call(localUrl, "/api/tickets/createTicket", localToken, { moduleToken }, "POST", { "Idempotency-Key": entryKey })).ticket;
    assert.equal(retried.idBoleto, offlineTicket.idBoleto);
  });
  const offlineId = uuid(offlineTicket.ticketId ?? id(offlineTicket));
  await step("open cash shift while offline", () => call(localUrl, "/api/cash-register/shifts/open", localToken, { moduloId: posId, openingAmount: 100 }));
  await step("resolve and quote cash ticket QR while offline", () => call(localUrl, "/api/cash-payments/tickets/resolve-qr", localToken, { qrValue: offlineTicket.idBoleto }));
  const session = (await step("start cash payment while offline", () => call(localUrl, `/api/cash-payments/tickets/${offlineId}/start`, localToken, { moduloId: posId }))).session;
  await step("complete cash payment while offline", () => call(localUrl, `/api/cash-payments/sessions/${id(session)}/insert-cash`, localToken, { amount: Number(session.amountExpected) }, "POST", { "Idempotency-Key": randomUUID() }));
  assert.equal((await call(localUrl, `/api/tickets/${offlineId}`, localToken)).ticket.pagado, true);
  await step("local exit while offline", () => call(localUrl, "/api/tickets/killTicket", localToken, { moduleToken: exitToken }, "POST", { "Idempotency-Key": randomUUID() }));
  assert((await local.db.query("SELECT count(*)::int AS n FROM outbox_events WHERE sent_at IS NULL")).rows[0].n > 0);
  assert.equal((await admin.db.query("SELECT count(*)::int AS n FROM inbox_events")).rows[0].n, beforeOutage);
  const offlineCount = (await local.db.query("SELECT count(*)::int AS n FROM outbox_events")).rows[0].n;
  cloudOnline = true;
  await step("reconnect and project all offline events", () => waitFor(async () => {
    const pendingCount = (await local.db.query("SELECT count(*)::int AS n FROM outbox_events WHERE sent_at IS NULL")).rows[0].n;
    const cloudCount = (await admin.db.query("SELECT count(*)::int AS n FROM inbox_events WHERE processed_at IS NOT NULL")).rows[0].n;
    return pendingCount === 0 && cloudCount === offlineCount;
  }, "offline outbox delivery"));
  const mirror = (await admin.db.query("SELECT payload FROM operational_tickets WHERE aggregate_id=$1", [offlineId])).rows[0].payload;
  assert.equal(mirror.pagado, true); assert(mirror.hora_salida);
  await step("cloud historical dashboard", async () => {
    const report = await call(adminUrl, `/api/local-projects/${projectId}/snapshot`, adminToken);
    assert.equal(report.snapshot.mode, "cloud-history"); assert.equal(report.snapshot.summary.tickets.paid, 2);
    assert(report.snapshot.summary.cashMovements.length);
  });
  for (const [directory, url] of [["ADMINISTRATIVO/viggo_web-ADMINISTRATIVO",adminUrl],["OPERATIVO/viggo-web-OPERATIVA",localUrl]]) {
    await step(`${directory} authenticated HTTP smoke`, async () => {
      await execFileAsync(process.execPath,["scripts/smoke-real-backend.mjs"], {cwd:resolve(workspace,directory),env:{...process.env,REAL_BACKEND_URL:url,REAL_BACKEND_ADMIN_EMAIL:email,REAL_BACKEND_ADMIN_PASSWORD:password,REAL_BACKEND_WRITE:"0",SMOKE_ENV_FILE:".env.nonexistent-smoke"},windowsHide:true,timeout:60_000});
    });
  }
  if (process.argv.includes("--clients")) {
    await step("real expendedora HTTP catalog client", async () => {
      const python = process.env.PYTHON_BIN ?? (existsSync(resolve(workspace,"OPERATIVO/expendedora-viggo/.venv/Scripts/python.exe")) ? resolve(workspace,"OPERATIVO/expendedora-viggo/.venv/Scripts/python.exe") : "python");
      await execFileAsync(python, ["scripts/smoke-postgres-client.py"], { cwd: resolve(workspace,"OPERATIVO/expendedora-viggo"), env: { ...process.env, VIGGO_API_URL: localUrl, SMOKE_PROJECT_ID: projectId, SMOKE_MODULE_ID: entryId }, windowsHide:true,timeout:30_000 });
    });
    await step("real Flutter HTTP datasources", async () => {
      const flutter = process.env.FLUTTER_BIN;
      assert(flutter, "Set FLUTTER_BIN to the absolute flutter.bat path for --clients");
      const env = { ...process.env, SMOKE_API_URL: adminUrl+"/api", SMOKE_EMAIL: mobileEmail, SMOKE_PASSWORD: password, SMOKE_PROJECT_ID: projectId, SMOKE_MODULE_TOKEN: moduleToken, SMOKE_EXIT_TOKEN: exitToken };
      const command = process.platform === "win32" ? "cmd.exe" : flutter;
      const args = process.platform === "win32" ? ["/d", "/s", "/c", `""${flutter}" test test/infrastructure/postgres_client_smoke_test.dart"`] : ["test", "test/infrastructure/postgres_client_smoke_test.dart"];
      await new Promise((resolveDone, reject) => {
        const child = spawn(command, args, { cwd: resolve(workspace,"ADMINISTRATIVO/viggo_app"), env, windowsHide:true, windowsVerbatimArguments: process.platform === "win32" });
        let output=""; child.stdout.on("data",data=>output+=data);child.stderr.on("data",data=>output+=data);
        child.on("error",reject);child.on("exit",code=>code===0?resolveDone():reject(new Error(output)));
      });
    });
  }
  console.log("PASS PostgreSQL client smoke; Stripe mock, no physical hardware.");
} catch (error) {
  steps.push({ name: "failure", status: "failed", error: error.message });
  console.error(error.message);
  if (error.stderr) console.error(String(error.stderr).split(password).join("[redacted]").split(secret).join("[redacted]").slice(-4000));
  // Startup failures have no HTTP error to diagnose; reveal only bounded, redacted logs.
  if (!adminToken) console.error(logs.join("").split(password).join("[redacted]").split(secret).join("[redacted]").slice(-4000));
  process.exitCode = 1;
} finally {
  for (const child of children) {
    const ended = once(child,"exit").catch(()=>{}); if (child.exitCode === null && child.signalCode === null) { child.kill(); await ended; }
  }
  if (proxy.listening) { proxy.closeAllConnections(); await new Promise(r=>proxy.close(r)); }
  for (const db of clients) await db.end();
  for (const {controlUrl,name} of databases.reverse()) {
    assert(/^viggo_smoke_[a-z0-9_]+_test$/.test(name));
    const control = new Client({connectionString:controlUrl}); await control.connect();
    try { await control.query(`DROP DATABASE "${name}" WITH (FORCE)`); } finally { await control.end(); }
  }
  const report = { issue:11, runId, stripe:"mock", physicalHardware:false, steps };
  writeFileSync(resolve(adminDir,"smoke-postgres-results.json"),JSON.stringify(report,null,2)+"\n");
}
