// Development seed. Run with `npm run db:seed` (also runs after `prisma migrate reset`).
// Test data (super admin, projects, modules, pension plans, users) is added in #10,
// once the models exist in schema.prisma.
import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { PostgresDatabase } from "../src/data/postgres";

const appEnv = (process.env.APP_ENV ?? "dev").trim().toLowerCase();
if (appEnv === "prod") {
  throw new Error("The seed must not run against production.");
}
const envFilePath = resolve(process.cwd(), `.env.${appEnv}`);
if (existsSync(envFilePath)) loadDotenv({ path: envFilePath, quiet: true });

const main = async () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");

  await PostgresDatabase.connect({ databaseUrl });
  console.log("[SEED] No seed data defined yet.");
};

main()
  .catch((error) => {
    console.error("[SEED] Failed", error);
    process.exitCode = 1;
  })
  .finally(() => PostgresDatabase.disconnect());
