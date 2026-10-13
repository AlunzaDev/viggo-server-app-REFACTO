import { parse } from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

// Tests read their own env file so they can never point at the dev or prod database.
const testEnv = existsSync(".env.test") ? parse(readFileSync(".env.test")) : {};
// globalSetup runs in this process, `test.env` only reaches the workers.
Object.assign(process.env, { APP_ENV: "test" }, testEnv);

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    env: { APP_ENV: "test", ...testEnv },
    globalSetup: ["tests/setup/global-setup.ts"],
    // Integration tests share one database; run files one at a time.
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 60_000,
  },
});
