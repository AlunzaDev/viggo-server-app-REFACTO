// Read-only audit of users' app access: `npm run audit:app-permissions`.
// Exit code 2 when critical issues are found.
//
// Postgres already guarantees valid apps, existing profiles, one profile per app and the
// unique profile name per app; this audit checks the rules the database cannot express.
import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { PostgresDatabase } from "../src/data/postgres";
import { USER_MODULES_BY_APP } from "../src/domain/constants/user-modules";
import { isRoleAllowedForApp } from "../src/domain/constants/app-access-policy";
import type { UserAppAccess } from "../src/domain/constants/user-apps";
import type { UsuarioRol } from "../src/domain/constants/auth-roles";

const appEnv = (process.env.APP_ENV ?? "dev").trim().toLowerCase();
const envFilePath = resolve(process.cwd(), `.env.${appEnv}`);
if (existsSync(envFilePath)) loadDotenv({ path: envFilePath, quiet: true });

type Issue = { severity: "critical" | "warning"; scope: string; id: string; code: string; [key: string]: unknown };
const issues: Issue[] = [];
const addIssue = (severity: Issue["severity"], scope: string, id: string, code: string, details: object = {}) =>
  issues.push({ severity, scope, id, code, ...details });

const WEB_APPS = new Set<UserAppAccess>(["ADMIN_WEB", "OPERATIVE_WEB"]);

const main = async () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required to run the read-only audit");
  const db = await PostgresDatabase.connect({ databaseUrl, poolMax: 2 });

  const [profiles, users] = await Promise.all([
    db.permissionProfile.findMany(),
    db.usuario.findMany({
      select: {
        id: true,
        rol: true,
        allowedApps: true,
        appPermissions: { select: { app: true, permissionProfile: { select: { id: true, app: true, estado: true } } } },
      },
    }),
  ]);

  for (const profile of profiles) {
    const allowed = new Set<string>(USER_MODULES_BY_APP[profile.app]);
    const outside = profile.modules.filter((module) => !allowed.has(module));
    if (outside.length) addIssue("critical", "permissionProfile", profile.id, "MODULES_OUTSIDE_APP", { app: profile.app, modules: outside });
  }

  for (const user of users) {
    const allowedApps = user.allowedApps as UserAppAccess[];
    if (new Set(allowedApps).size !== allowedApps.length) addIssue("warning", "user", user.id, "DUPLICATE_ALLOWED_APPS");

    for (const app of allowedApps) {
      if (!WEB_APPS.has(app)) continue;
      if (!user.appPermissions.some((permission) => permission.app === app)) {
        addIssue("critical", "user", user.id, "WEB_APP_WITHOUT_PROFILE", { app });
      }
      if (!isRoleAllowedForApp(user.rol as UsuarioRol, app)) {
        addIssue("critical", "user", user.id, "ROLE_NOT_ALLOWED_FOR_WEB_APP", { app, role: user.rol });
      }
    }

    for (const permission of user.appPermissions) {
      const profile = permission.permissionProfile;
      if (!allowedApps.includes(permission.app)) {
        addIssue("critical", "user", user.id, "INVALID_APP_PERMISSION", { app: permission.app, profileId: profile.id });
      } else if (profile.app !== permission.app) {
        addIssue("critical", "user", user.id, "PROFILE_APP_MISMATCH", { app: permission.app, profileId: profile.id, profileApp: profile.app });
      } else if (!profile.estado) {
        addIssue("warning", "user", user.id, "INACTIVE_PROFILE", { app: permission.app, profileId: profile.id });
      }
    }
  }

  const summary = {
    readOnly: true,
    users: users.length,
    permissionProfiles: profiles.length,
    critical: issues.filter((issue) => issue.severity === "critical").length,
    warnings: issues.filter((issue) => issue.severity === "warning").length,
    issues,
  };
  console.log(JSON.stringify(summary, null, 2));
  process.exitCode = summary.critical > 0 ? 2 : 0;
};

main()
  .catch((error) => {
    console.error("[AUDIT] Failed", error);
    process.exitCode = 1;
  })
  .finally(() => PostgresDatabase.disconnect());
