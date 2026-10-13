import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "prisma/config";

// Load the same env file the API uses (.env.<APP_ENV>), so `prisma migrate` targets the same database.
const appEnv = (process.env.APP_ENV ?? "dev").trim().toLowerCase();
const envFilePath = resolve(process.cwd(), `.env.${appEnv}`);
if (existsSync(envFilePath)) loadDotenv({ path: envFilePath, quiet: true });
else loadDotenv({ quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  // Not required for `prisma generate` (e.g. during the Docker build), only for migrate/studio.
  datasource: {
    url: process.env.DATABASE_URL ?? "",
  },
});
