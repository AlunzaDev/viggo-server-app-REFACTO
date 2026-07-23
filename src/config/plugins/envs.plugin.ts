import { config as loadDotenv } from "dotenv";
import * as env from "env-var";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const appEnv = (process.env.APP_ENV ?? "dev").trim().toLowerCase();
const envFilePath = resolve(process.cwd(), `.env.${appEnv}`);

if (existsSync(envFilePath)) loadDotenv({ path: envFilePath });
else loadDotenv();

const getConfigValue = (key: string): string | undefined => process.env[key];
const isProd = appEnv === "prod" || env.get("PROD").default("false").asBool();
const webServiceUrl = getConfigValue("WEB_SERVICE_URL") ?? "";
const webClientUrl = getConfigValue("WEB_CLIENT_URL")?.trim() || webServiceUrl;
const corsAllowedOrigins = [
  webClientUrl,
  webServiceUrl,
  ...(getConfigValue("CORS_ALLOWED_ORIGINS") ?? "").split(","),
]
  .map((value) => value.trim())
  .filter(Boolean);

const mongoUrl = getConfigValue("MONGO_URL") ?? "";
if (!mongoUrl) throw new Error("MONGO_URL is required.");

const parseBoundedInteger = (
  rawValue: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number => {
  if (!rawValue?.trim()) return fallback;
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`Invalid integer value \"${rawValue}\" for range ${min}-${max}`);
  }
  return parsed;
};

const parseSameSite = (
  rawValue: string | undefined,
  fallback: "lax" | "strict" | "none",
): "lax" | "strict" | "none" => {
  if (!rawValue?.trim()) return fallback;
  const normalized = rawValue.trim().toLowerCase();
  if (normalized === "lax" || normalized === "strict" || normalized === "none") {
    return normalized;
  }
  throw new Error(`Invalid AUTH_COOKIE_SAME_SITE value \"${rawValue}\"`);
};

const authCookieSecure = env
  .get("AUTH_COOKIE_SECURE")
  .default(isProd ? "true" : "false")
  .asBool();
const authCookieSameSite = parseSameSite(
  env.get("AUTH_COOKIE_SAME_SITE").asString(),
  isProd ? "none" : "lax",
);

export const envs = {
  APP_ENV: appEnv,
  PROD: isProd,
  JWT_SEED: env.get("JWT_SEED").required().asString(),
  MONGO_URL: mongoUrl,
  MONGO_DB_NAME: getConfigValue("MONGO_DB_NAME") ?? "viggo-nubeadmin",
  MONGO_DISCONNECT_EXIT_DELAY_MS: parseBoundedInteger(
    env.get("MONGO_DISCONNECT_EXIT_DELAY_MS").asString(),
    30000,
    1000,
    300000,
  ),
  MAILER_EMAIL: env.get("MAILER_EMAIL").default("").asString(),
  MAILER_SECRET_KEY: env.get("MAILER_SECRET_KEY").default("").asString(),
  MAILER_SERVICE: env.get("MAILER_SERVICE").default("").asString(),
  MAILER_HOST: env.get("MAILER_HOST").default("").asString(),
  MAILER_PORT: env.get("MAILER_PORT").default("465").asPortNumber(),
  MAILER_SECURE: env.get("MAILER_SECURE").default("true").asBool(),
  MAILER_FROM_NAME: env.get("MAILER_FROM_NAME").default("Viggo").asString(),
  HOST: env.get("HOST").default("0.0.0.0").asString(),
  PORT: env.get("PORT").default("8080").asPortNumber(),
  PUBLIC_PATH: env.get("PUBLIC_PATH").default("public").asString(),
  WEB_SERVICE_URL: webServiceUrl,
  WEB_CLIENT_URL: webClientUrl,
  CORS_ALLOWED_ORIGINS: [...new Set(corsAllowedOrigins)],
  AUTH_COOKIE_NAME: env.get("AUTH_COOKIE_NAME").default("viggo_admin_auth").asString(),
  AUTH_COOKIE_SECURE: authCookieSecure,
  AUTH_COOKIE_SAME_SITE: authCookieSameSite,
  AUTH_COOKIE_MAX_AGE_MS: env
    .get("AUTH_COOKIE_MAX_AGE_MS")
    .default(String(1000 * 60 * 60 * 24 * 2))
    .asIntPositive(),
  SECRET_STRIPE_KEY: env.get("SECRET_STRIPE_KEY").default("").asString(),
  STRIPE_WEBHOOK_SECRET: env.get("STRIPE_WEBHOOK_SECRET").default("").asString(),
  STRIPE_CURRENCY: env.get("STRIPE_CURRENCY").default("mxn").asString(),
  STRIPE_ENABLED: env.get("STRIPE_ENABLED").default(isProd ? "true" : "false").asBool(),
  STRIPE_MOCK_ENABLED: env.get("STRIPE_MOCK_ENABLED").default(isProd ? "false" : "true").asBool(),
  SYNC_SERVICE_TOKEN: env.get("SYNC_SERVICE_TOKEN").default("").asString(),
};
