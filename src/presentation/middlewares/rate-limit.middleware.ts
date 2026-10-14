import { NextFunction, Request, Response } from "express";

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  message?: string;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const DEFAULT_MESSAGE = "Demasiados intentos. Intenta de nuevo más tarde.";

/**
 * In-memory counters with a fixed window. Expired entries are dropped periodically so
 * the map does not grow without bound. Limits are per API instance.
 */
class WindowCounter {
  private readonly buckets = new Map<string, Bucket>();
  private lastSweepAt = 0;

  constructor(private readonly windowMs: number) {}

  private sweep(now: number) {
    if (now - this.lastSweepAt < this.windowMs) return;
    this.lastSweepAt = now;
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }

  private current(key: string, now: number): Bucket | undefined {
    const bucket = this.buckets.get(key);
    return bucket && bucket.resetAt > now ? bucket : undefined;
  }

  count(key: string, now = Date.now()): number {
    return this.current(key, now)?.count ?? 0;
  }

  retryAfterSeconds(key: string, now = Date.now()): number {
    const bucket = this.current(key, now);
    return bucket ? Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) : 0;
  }

  increment(key: string, now = Date.now()): number {
    this.sweep(now);
    const bucket = this.current(key, now);
    if (!bucket) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      return 1;
    }
    bucket.count += 1;
    return bucket.count;
  }

  reset(key: string) {
    this.buckets.delete(key);
  }
}

/**
 * Client address as Express resolves it. X-Forwarded-For is only honoured when the app
 * sets `trust proxy` (TRUST_PROXY); reading the header directly would let anyone send a
 * different address on every request and never be limited.
 */
const clientIp = (req: Request) => req.ip || req.socket.remoteAddress || "unknown";

const tooManyRequests = (res: Response, retryAfterSeconds: number, message: string) => {
  res.setHeader("Retry-After", String(retryAfterSeconds));
  return res.status(429).json({ error: message });
};

/** Limits every request to a route per client address. */
export const rateLimitMiddleware = ({ windowMs, maxRequests, message = DEFAULT_MESSAGE }: RateLimitOptions) => {
  const counter = new WindowCounter(windowMs);
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${req.method}:${req.baseUrl}${req.path}:${clientIp(req)}`;
    if (counter.count(key) >= maxRequests) {
      return tooManyRequests(res, counter.retryAfterSeconds(key), message);
    }
    counter.increment(key);
    return next();
  };
};

export interface LoginAttemptLimitOptions {
  windowMs: number;
  /** Failed attempts allowed per account (correo/telefono) within the window. */
  maxFailuresPerAccount: number;
  /** Failed attempts allowed per client address within the window (any account). */
  maxFailuresPerIp: number;
  /** Request body field that identifies the account. */
  accountField: string;
  message?: string;
}

/** Responses that mean "wrong credentials" (they count as a failed attempt). */
const FAILED_LOGIN_STATUSES = new Set([401, 403]);

/**
 * Brute-force protection for login: only failed attempts count, so normal use (and manual
 * testing) is not blocked, and a successful login clears the account's counter. An account
 * is blocked after too many failures from anywhere; an address is blocked after too many
 * failures across accounts (password spraying).
 */
export const loginAttemptLimiter = ({
  windowMs,
  maxFailuresPerAccount,
  maxFailuresPerIp,
  accountField,
  message = DEFAULT_MESSAGE,
}: LoginAttemptLimitOptions) => {
  const accounts = new WindowCounter(windowMs);
  const addresses = new WindowCounter(windowMs);

  return (req: Request, res: Response, next: NextFunction) => {
    const account = String(req.body?.[accountField] ?? "").trim().toLowerCase();
    const accountKey = account ? `${req.baseUrl}${req.path}:${account}` : "";
    const ipKey = `${req.baseUrl}${req.path}:${clientIp(req)}`;

    if (accountKey && accounts.count(accountKey) >= maxFailuresPerAccount) {
      return tooManyRequests(res, accounts.retryAfterSeconds(accountKey), message);
    }
    if (addresses.count(ipKey) >= maxFailuresPerIp) {
      return tooManyRequests(res, addresses.retryAfterSeconds(ipKey), message);
    }

    res.on("finish", () => {
      if (FAILED_LOGIN_STATUSES.has(res.statusCode)) {
        if (accountKey) accounts.increment(accountKey);
        addresses.increment(ipKey);
      } else if (res.statusCode < 300 && accountKey) {
        accounts.reset(accountKey);
      }
    });
    return next();
  };
};
