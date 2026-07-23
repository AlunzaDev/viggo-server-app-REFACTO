import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(currentDir, "..");
const tscBin = resolve(projectRoot, "node_modules", "typescript", "bin", "tsc");
const appEntry = resolve(projectRoot, "dist", "app.js");

if (!existsSync(tscBin)) {
  console.error("[DEV] TypeScript no está instalado. Ejecuta `npm install` primero.");
  process.exit(1);
}

const runNode = (args, options = {}) =>
  spawn(process.execPath, args, {
    cwd: projectRoot,
    stdio: "inherit",
    ...options,
  });

console.log("[DEV] Compilando el proyecto antes de iniciar...");
const initialBuild = spawnSync(process.execPath, [tscBin], {
  cwd: projectRoot,
  stdio: "inherit",
});

if (initialBuild.error) {
  console.error("[DEV] No se pudo ejecutar TypeScript:", initialBuild.error);
  process.exit(1);
}

if (initialBuild.status !== 0) {
  console.error("[DEV] La compilación inicial falló.");
  process.exit(initialBuild.status ?? 1);
}

if (!existsSync(appEntry)) {
  console.error(`[DEV] No se generó el archivo esperado: ${appEntry}`);
  process.exit(1);
}

console.log("[DEV] Iniciando compilación incremental y servidor con recarga...");

const compiler = runNode([tscBin, "--watch", "--preserveWatchOutput"]);
const server = runNode(["--watch", appEntry]);

let shuttingDown = false;

const shutdown = (signal = "SIGTERM", exitCode = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;

  if (!compiler.killed) compiler.kill(signal);
  if (!server.killed) server.kill(signal);

  setTimeout(() => process.exit(exitCode), 100).unref();
};

compiler.on("error", (error) => {
  console.error("[DEV] Error en el compilador:", error);
  shutdown("SIGTERM", 1);
});

server.on("error", (error) => {
  console.error("[DEV] Error en el servidor:", error);
  shutdown("SIGTERM", 1);
});

server.on("exit", (code, signal) => {
  if (!shuttingDown && code !== 0) {
    console.error(`[DEV] El servidor terminó inesperadamente (code=${code}, signal=${signal}).`);
    shutdown("SIGTERM", code ?? 1);
  }
});

process.on("SIGINT", () => shutdown("SIGINT", 0));
process.on("SIGTERM", () => shutdown("SIGTERM", 0));
