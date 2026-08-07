import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { config as loadDotenv } from "dotenv";
import mongoose from "mongoose";

const appEnv = String(process.env.APP_ENV ?? "dev").trim().toLowerCase();
const envFile = resolve(process.cwd(), `.env.${appEnv}`);

loadDotenv(existsSync(envFile) ? { path: envFile } : undefined);

const mongoUrl = String(process.env.MONGO_URL ?? "").trim();
const dbName = String(
  process.env.MONGO_DB_NAME ?? "viggo-administrativo",
).trim();

if (!mongoUrl) {
  throw new Error("MONGO_URL is required to run the read-only audit");
}

const APPS = new Set(["ADMIN_WEB", "OPERATIVE_WEB", "OPERATIVE_MOBILE"]);
const WEB_APPS = new Set(["ADMIN_WEB", "OPERATIVE_WEB"]);
const WEB_ROLES = new Set(["ADMIN_ROLE", "SUPER_ROLE"]);
const MODULES_BY_APP = {
  ADMIN_WEB: new Set([
    "users",
    "permissionProfiles",
    "installations",
    "projects",
    "modules",
    "pensions",
    "pensionPasses",
    "payments",
  ]),
  OPERATIVE_WEB: new Set([
    "cashPayments",
    "modules",
    "pensions",
    "pensionPasses",
    "tickets",
    "pensionMoves",
    "payments",
  ]),
  OPERATIVE_MOBILE: new Set([
    "cashPayments",
    "modules",
    "pensions",
    "pensionPasses",
    "tickets",
    "pensionMoves",
    "payments",
  ]),
};

const issues = [];

const addIssue = (severity, scope, id, code, details = {}) => {
  issues.push({ severity, scope, id: String(id), code, ...details });
};

try {
  await mongoose.connect(mongoUrl, { dbName });

  const usersCollection = mongoose.connection.collection("usuarios");
  const profilesCollection = mongoose.connection.collection("permissionprofiles");
  const [users, profiles, userIndexes, profileIndexes] = await Promise.all([
    usersCollection.find({}).toArray(),
    profilesCollection.find({}).toArray(),
    usersCollection.indexes(),
    profilesCollection.indexes(),
  ]);

  const profilesById = new Map(
    profiles.map((profile) => [String(profile._id), profile]),
  );

  for (const profile of profiles) {
    const id = String(profile._id);
    const app = profile.app;
    const modules = Array.isArray(profile.modules) ? profile.modules : [];

    if (!APPS.has(app)) {
      addIssue("critical", "permissionProfile", id, "INVALID_APP", { app });
      continue;
    }

    const invalidModules = modules.filter(
      (module) => !MODULES_BY_APP[app].has(module),
    );

    if (invalidModules.length > 0) {
      addIssue(
        "critical",
        "permissionProfile",
        id,
        "MODULES_OUTSIDE_APP",
        { app, modules: invalidModules },
      );
    }
  }

  for (const user of users) {
    const id = String(user._id);
    const allowedApps = Array.isArray(user.allowedApps) ? user.allowedApps : [];
    const permissions = Array.isArray(user.appPermissions)
      ? user.appPermissions
      : [];
    const role = String(user.rol ?? "").trim();

    if (
      Object.prototype.hasOwnProperty.call(user, "permissionProfileId") ||
      Object.prototype.hasOwnProperty.call(user, "modules")
    ) {
      addIssue("warning", "user", id, "LEGACY_FIELDS_PRESENT");
    }

    const invalidApps = allowedApps.filter((app) => !APPS.has(app));
    if (invalidApps.length > 0) {
      addIssue("critical", "user", id, "INVALID_ALLOWED_APPS", {
        apps: invalidApps,
      });
    }

    if (new Set(allowedApps).size !== allowedApps.length) {
      addIssue("warning", "user", id, "DUPLICATE_ALLOWED_APPS");
    }

    const assignedApps = permissions.map((permission) => permission?.app);
    if (new Set(assignedApps).size !== assignedApps.length) {
      addIssue("critical", "user", id, "DUPLICATE_APP_PERMISSIONS");
    }

    for (const app of allowedApps) {
      const assignment = permissions.find(
        (permission) => permission?.app === app,
      );

      if (WEB_APPS.has(app) && !assignment) {
        addIssue("critical", "user", id, "WEB_APP_WITHOUT_PROFILE", { app });
      }
      if (WEB_APPS.has(app) && !WEB_ROLES.has(role)) {
        addIssue("critical", "user", id, "ROLE_NOT_ALLOWED_FOR_WEB_APP", {
          app,
          role,
        });
      }
    }

    for (const permission of permissions) {
      const app = permission?.app;
      const profileId = String(permission?.permissionProfileId ?? "").trim();

      if (!APPS.has(app) || !allowedApps.includes(app) || !profileId) {
        addIssue("critical", "user", id, "INVALID_APP_PERMISSION", {
          app,
          profileId,
        });
        continue;
      }

      const profile = profilesById.get(profileId);
      if (!profile) {
        addIssue("critical", "user", id, "MISSING_PROFILE", {
          app,
          profileId,
        });
      } else if (profile.app !== app) {
        addIssue("critical", "user", id, "PROFILE_APP_MISMATCH", {
          app,
          profileId,
          profileApp: profile.app,
        });
      } else if (profile.estado !== true) {
        addIssue("warning", "user", id, "INACTIVE_PROFILE", {
          app,
          profileId,
        });
      }
    }
  }

  const expectedProfileIndex = profileIndexes.some(
    (index) =>
      index.unique === true && index.key?.app === 1 && index.key?.nombre === 1,
  );

  if (!expectedProfileIndex) {
    addIssue("critical", "database", dbName, "MISSING_PROFILE_UNIQUE_INDEX");
  }

  const summary = {
    readOnly: true,
    database: dbName,
    users: users.length,
    permissionProfiles: profiles.length,
    critical: issues.filter((issue) => issue.severity === "critical").length,
    warnings: issues.filter((issue) => issue.severity === "warning").length,
    indexes: {
      users: userIndexes.map((index) => ({
        name: index.name,
        key: index.key,
        unique: index.unique === true,
      })),
      permissionProfiles: profileIndexes.map((index) => ({
        name: index.name,
        key: index.key,
        unique: index.unique === true,
      })),
    },
    issues,
  };

  console.log(JSON.stringify(summary, null, 2));
  process.exitCode = summary.critical > 0 ? 2 : 0;
} finally {
  await mongoose.disconnect();
}
