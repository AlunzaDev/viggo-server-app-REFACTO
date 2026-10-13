import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const apiDirectory = resolve(scriptDirectory, "..");
const webDirectory = resolve(apiDirectory, "..", "viggo_web-ADMINISTRATIVO");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const allowedAdvisories = new Set([
  // Solo afecta React Server Components. Esta aplicación se compila como SPA con Vite.
  "https://github.com/advisories/GHSA-qwww-vcr4-c8h2",
]);

let failures = 0;

const heading = (message) => console.log(`\n==> ${message}`);
const pass = (message) => console.log(`[OK] ${message}`);
const warn = (message) => console.warn(`[WARN] ${message}`);
const fail = (message) => {
  failures += 1;
  console.error(`[FAIL] ${message}`);
};

const spawnNpm = (args, options) =>
  process.platform === "win32"
    ? spawnSync(process.env.ComSpec || "cmd.exe", [
        "/d",
        "/s",
        "/c",
        [npmCommand, ...args].join(" "),
      ], options)
    : spawnSync(npmCommand, args, options);

const run = (label, cwd, args) => {
  heading(label);
  const result = spawnNpm(args, {
    cwd,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.status === 0) pass(label);
  else fail(`${label} (salida ${result.status ?? "desconocida"})`);
};

const auditDependencies = (label, cwd) => {
  heading(label);
  const result = spawnNpm(["audit", "--omit=dev", "--json"], {
    cwd,
    encoding: "utf8",
  });

  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    if (result.stderr) console.error(result.stderr.trim());
    fail(`${label}: npm no devolvió un informe JSON válido`);
    return;
  }

  const ignoredPackages = new Set();
  const blocking = [];
  const warnings = [];

  for (const [name, vulnerability] of Object.entries(report.vulnerabilities ?? {})) {
    const advisoryUrls = (vulnerability.via ?? [])
      .filter((item) => typeof item === "object" && item !== null)
      .map((item) => item.url)
      .filter(Boolean);
    const indirectNames = (vulnerability.via ?? []).filter(
      (item) => typeof item === "string",
    );
    const explicitlyAllowed =
      advisoryUrls.length > 0 &&
      advisoryUrls.every((url) => allowedAdvisories.has(url));
    const allowedByDependency =
      advisoryUrls.length === 0 &&
      indirectNames.length > 0 &&
      indirectNames.every((dependency) => ignoredPackages.has(dependency));

    if (explicitlyAllowed || allowedByDependency) {
      ignoredPackages.add(name);
      warn(`${name}: aviso RSC aceptado temporalmente; la aplicación es SPA`);
      continue;
    }

    const item = `${name} (${vulnerability.severity})`;
    if (vulnerability.severity === "critical" || vulnerability.severity === "high") {
      blocking.push(item);
    } else {
      warnings.push(item);
    }
  }

  warnings.forEach((item) => warn(`${label}: ${item}`));
  if (blocking.length > 0) fail(`${label}: ${blocking.join(", ")}`);
  else pass(label);
};

const verifyTrackedSecrets = () => {
  heading("Archivos rastreados sin secretos evidentes");
  const allowedPlaceholder =
    /change-me|replace-with|example|dummy|localhost|\$\{|viggo-dev-password/i;
  const findings = [];
  const repositories = [
    ["api", apiDirectory],
    ["web", webDirectory],
  ];

  for (const [repositoryName, repositoryDirectory] of repositories) {
    let trackedFiles;
    try {
      trackedFiles = execFileSync("git", ["ls-files", "-z"], {
        cwd: repositoryDirectory,
        encoding: "utf8",
      })
        .split("\0")
        .filter(Boolean);
    } catch {
      fail(`No fue posible enumerar los archivos rastreados de ${repositoryName}`);
      continue;
    }

    for (const relativePath of trackedFiles) {
      let content;
      try {
        content = readFileSync(resolve(repositoryDirectory, relativePath), "utf8");
      } catch {
        continue;
      }

      for (const match of content.matchAll(/postgres(?:ql)?:\/\/([^\s:@/]+):([^\s@/]+)@/gi)) {
        if (!allowedPlaceholder.test(match[2])) {
          findings.push(
            `${repositoryName}/${relativePath}: URL PostgreSQL con contraseña embebida`,
          );
        }
      }
    }
  }

  if (findings.length > 0) findings.forEach(fail);
  else pass("Archivos rastreados sin secretos evidentes");
};

const verifySecurityWiring = () => {
  heading("Protecciones críticas de rutas y configuración");
  const routes = readFileSync(
    resolve(apiDirectory, "src/presentation/routes/routes.ts"),
    "utf8",
  );
  const syncRoutes = readFileSync(
    resolve(apiDirectory, "src/presentation/routes/sync/sync.routes.ts"),
    "utf8",
  );
  const envConfig = readFileSync(
    resolve(apiDirectory, "src/config/plugins/envs.plugin.ts"),
    "utf8",
  );

  const checks = [
    ["Usuarios requieren autenticación", /"\/api\/usuarios"[\s\S]*?AuthMiddleware\.requireAuth/],
    ["Perfiles requieren autenticación", /"\/api\/permission-profiles"[\s\S]*?AuthMiddleware\.requireAuth/],
    ["Usuarios requieren ADMIN_WEB", /"\/api\/usuarios"[\s\S]*?requireAdminApp/],
    ["Perfiles requieren ADMIN_WEB", /"\/api\/permission-profiles"[\s\S]*?requireAdminApp/],
  ];

  for (const [label, pattern] of checks) {
    if (pattern.test(routes)) pass(label);
    else fail(label);
  }
  if (/router\.use\(requireSyncAuth\)/.test(syncRoutes)) {
    pass("Sincronización requiere token de servicio");
  } else {
    fail("Sincronización requiere token de servicio");
  }
  if (/corsAllowedOrigins\.length === 0/.test(envConfig) && /AUTH_COOKIE_SECURE/.test(envConfig)) {
    pass("Guardas de CORS y cookies presentes");
  } else {
    fail("Guardas de CORS y cookies presentes");
  }
};

console.log("Preflight Administrativo (sin escrituras salvo artefactos de build)");
verifyTrackedSecrets();
verifySecurityWiring();
auditDependencies("Dependencias API de producción", apiDirectory);
auditDependencies("Dependencias Web de producción", webDirectory);
run("Compilación API", apiDirectory, ["run", "build"]);
run("Lint Web", webDirectory, ["run", "lint"]);
run("Compilación Web", webDirectory, ["run", "build"]);
run("Permisos e índices MongoDB (solo lectura)", apiDirectory, [
  "run",
  "audit:app-permissions",
]);

heading("Resultado");
if (failures > 0) {
  console.error(`Preflight RECHAZADO: ${failures} comprobación(es) fallaron.`);
  process.exitCode = 1;
} else {
  console.log("Preflight APROBADO.");
}
