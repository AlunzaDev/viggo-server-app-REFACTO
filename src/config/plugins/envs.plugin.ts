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
const jwtSeed = env.get("JWT_SEED").required().asString().trim();
const installationLinkTokenSecret = env
  .get("INSTALLATION_LINK_TOKEN_SECRET")
  .default("")
  .asString()
  .trim();
const syncServiceToken = env.get("SYNC_SERVICE_TOKEN").default("").asString().trim();
const mailerEmail = env.get("MAILER_EMAIL").default("").asString().trim();
const mailerSecretKey = env.get("MAILER_SECRET_KEY").default("").asString().trim();
const mailerHost = env.get("MAILER_HOST").default("").asString().trim();
const stripeEnabled = env.get("STRIPE_ENABLED").default(isProd ? "true" : "false").asBool();
const stripeSecretKey = env.get("SECRET_STRIPE_KEY").default("").asString().trim();
const stripeWebhookSecret = env.get("STRIPE_WEBHOOK_SECRET").default("").asString().trim();

for (const origin of corsAllowedOrigins) {
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new Error(`Invalid CORS origin: ${origin}`);
  }
  if (!(["http:", "https:"] as string[]).includes(parsed.protocol) || parsed.origin !== origin) {
    throw new Error(`CORS origin must be an exact HTTP(S) origin without a path: ${origin}`);
  }
}

if (authCookieSameSite === "none" && !authCookieSecure) {
  throw new Error("AUTH_COOKIE_SECURE must be true when AUTH_COOKIE_SAME_SITE=none.");
}

if (isProd) {
  const requireProductionSecret = (name: string, value: string): void => {
    if (value.length < 32) {
      throw new Error(`${name} must contain at least 32 characters in production.`);
    }
  };

  if (corsAllowedOrigins.length === 0) {
    throw new Error("CORS_ALLOWED_ORIGINS or WEB_CLIENT_URL is required in production.");
  }
  if (!authCookieSecure) {
    throw new Error("AUTH_COOKIE_SECURE must be true in production.");
  }
  requireProductionSecret("JWT_SEED", jwtSeed);
  requireProductionSecret("INSTALLATION_LINK_TOKEN_SECRET", installationLinkTokenSecret);
  requireProductionSecret("SYNC_SERVICE_TOKEN", syncServiceToken);

  if (!mailerEmail || !mailerSecretKey || !mailerHost) {
    throw new Error("MAILER_EMAIL, MAILER_SECRET_KEY and MAILER_HOST are required in production.");
  }
  if (stripeEnabled && (!stripeSecretKey || !stripeWebhookSecret)) {
    throw new Error("SECRET_STRIPE_KEY and STRIPE_WEBHOOK_SECRET are required when Stripe is enabled.");
  }
}

export const envs = {
  APP_ENV: appEnv,
  PROD: isProd,
  JWT_SEED: jwtSeed,
  INSTALLATION_LINK_TOKEN_SECRET: installationLinkTokenSecret,
  MONGO_URL: mongoUrl,
  MONGO_DB_NAME: getConfigValue("MONGO_DB_NAME") ?? "viggo-administrativo",
  MONGO_DISCONNECT_EXIT_DELAY_MS: parseBoundedInteger(
    env.get("MONGO_DISCONNECT_EXIT_DELAY_MS").asString(),
    30000,
    1000,
    300000,
  ),
  MAILER_EMAIL: mailerEmail,
  MAILER_SECRET_KEY: mailerSecretKey,
  MAILER_SERVICE: env.get("MAILER_SERVICE").default("").asString(),
  MAILER_HOST: mailerHost,
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
  SECRET_STRIPE_KEY: stripeSecretKey,
  STRIPE_WEBHOOK_SECRET: stripeWebhookSecret,
  STRIPE_CURRENCY: env.get("STRIPE_CURRENCY").default("mxn").asString(),
  STRIPE_ENABLED: stripeEnabled,
  STRIPE_MOCK_ENABLED: env.get("STRIPE_MOCK_ENABLED").default(isProd ? "false" : "true").asBool(),
  SYNC_SERVICE_TOKEN: syncServiceToken,
  FINANCIAL_RECONCILIATION_WORKER_ENABLED: env
    .get("FINANCIAL_RECONCILIATION_WORKER_ENABLED")
    .default("true")
    .asBool(),
  FINANCIAL_RECONCILIATION_INTERVAL_MINUTES: parseBoundedInteger(
    env.get("FINANCIAL_RECONCILIATION_INTERVAL_MINUTES").asString(),
    15,
    1,
    1440,
  ),
  FINANCIAL_RECONCILIATION_BATCH_SIZE: parseBoundedInteger(
    env.get("FINANCIAL_RECONCILIATION_BATCH_SIZE").asString(),
    50,
    1,
    500,
  ),
};
