import { parse } from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

// Tests read their own env file so they can never point at the dev or prod database.
const testEnv = existsSync(".env.test") ? parse(readFileSync(".env.test")) : {};
// The app config (envs.plugin) requires these; tests never use Mongo or real secrets.
const appDefaults = {
  APP_ENV: "test",
  MONGO_URL: "mongodb://127.0.0.1:1/unused-in-tests",
  JWT_SEED: "test-jwt-seed-not-a-real-secret-0000",
  INSTALLATION_LINK_TOKEN_SECRET: "test-link-secret-not-a-real-secret-00",
};
// globalSetup runs in this process, `test.env` only reaches the workers.
Object.assign(process.env, appDefaults, testEnv);

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    env: { ...appDefaults, ...testEnv },
    globalSetup: ["tests/setup/global-setup.ts"],
    setupFiles: ["tests/setup/app-env.ts"],
    // Integration tests share one database; run files one at a time.
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 60_000,
  },
});
