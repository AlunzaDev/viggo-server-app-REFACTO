import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

// Applies pending migrations to the test database once before the run (non-destructive).
// Tests clean up the rows they create.
export default function setup() {
  const databaseUrl = process.env.DATABASE_URL ?? "";
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is missing. Copy .env.test.example to .env.test.");
  }

  const databaseName = new URL(databaseUrl).pathname.replace(/^\//, "");
  if (!databaseName.endsWith("_test")) {
    throw new Error(
      `Refusing to run tests against "${databaseName}": the test database name must end with "_test".`,
    );
  }

  const prismaBin = resolve("node_modules", "prisma", "build", "index.js");
  execFileSync(process.execPath, [prismaBin, "migrate", "deploy"], {
    env: { ...process.env, APP_ENV: "test" },
    stdio: "inherit",
  });
}
