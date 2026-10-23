import { randomUUID } from "node:crypto";
import type { RetentionTarget } from "../../../domain/datasources/system/data-retention.datasource";
import type { DataRetentionRepository } from "../../../domain/repositories/system/data-retention.repository";
import type { JobLockRepository } from "../../../domain/repositories/system/job-lock.repository";

const DAY_MS = 24 * 60 * 60 * 1000;
const LOCK_NAME = "data-retention";
const INSTANCE_ID = randomUUID();

export type RetentionDays = {
  financial: number;
  operational: number;
  inbox: number;
  mobileOperations: number;
  incidents: number;
  connectionEvents: number;
  pushSubscriptions: number;
};

export type RetentionRule = {
  target: RetentionTarget;
  days: number;
  /** The big tables go one parking at a time, through their (proyecto_id, ...) index. */
  perProject: boolean;
  /** Also rows without a parking (only external payment orders can lack one). */
  includeUnassigned?: boolean;
};

/** What to purge and after how many days (docs/retencion.md); a rule with 0 days is skipped. */
export const retentionPlan = (days: RetentionDays): RetentionRule[] => ([
  { target: "inbox_events", days: days.inbox, perProject: true },
  { target: "mobile_operations", days: days.mobileOperations, perProject: false },
  { target: "operational_incidents", days: days.incidents, perProject: false },
  { target: "connection_events", days: days.connectionEvents, perProject: true },
  { target: "push_subscriptions", days: days.pushSubscriptions, perProject: false },
  { target: "operational_tickets", days: days.operational, perProject: true },
  { target: "operational_payments", days: days.operational, perProject: true },
  { target: "operational_pension_moves", days: days.operational, perProject: true },
  { target: "operational_cash_payment_sessions", days: days.operational, perProject: true },
  { target: "operational_cash_register_shifts", days: days.operational, perProject: true },
  { target: "operational_cash_register_movements", days: days.operational, perProject: true },
  { target: "operational_cash_register_cuts", days: days.operational, perProject: true },
  { target: "external_payments", days: days.financial, perProject: true, includeUnassigned: true },
  { target: "payments", days: days.financial, perProject: false },
] satisfies RetentionRule[]).filter((rule) => rule.days > 0);

export type RetentionRun = {
  startedAt: number;
  finishedAt: number;
  /** Rows deleted per target. */
  deleted: Partial<Record<RetentionTarget, number>>;
  /** False when the time budget ran out: the next run continues. */
  complete: boolean;
  error: string;
};

export type DataRetentionOptions = { batchSize: number; budgetMs: number; intervalMs: number; startDelayMs: number };
const DEFAULTS: DataRetentionOptions = { batchSize: 2_000, budgetMs: 10 * 60_000, intervalMs: 6 * 60 * 60_000, startDelayMs: 5 * 60_000 };

/**
 * Purges what docs/retencion.md says, in small batches, outside any HTTP request
 * (REFACTO#70). With several API instances only the one holding the lock runs it.
 */
export class DataRetentionJob {
  private static last: RetentionRun | null = null;
  private readonly options: DataRetentionOptions;
  private timer?: ReturnType<typeof setInterval>;
  private startTimer?: ReturnType<typeof setTimeout>;
  private active?: Promise<unknown>;

  constructor(
    private readonly retention: DataRetentionRepository,
    private readonly locks: JobLockRepository,
    private readonly plan: RetentionRule[],
    options: Partial<DataRetentionOptions> = {},
  ) {
    this.options = { ...DEFAULTS, ...options };
  }

  /** The last run, for /api/health/retention. */
  static getHealthSnapshot() {
    return { status: DataRetentionJob.last?.error ? "degraded" : "ok", lastRun: DataRetentionJob.last };
  }

  start() {
    const tick = () => {
      if (this.active) return;
      this.active = this.runOnce().catch((error) => console.error("[ADMIN data retention]", error))
        .finally(() => { this.active = undefined; });
    };
    this.startTimer = setTimeout(tick, this.options.startDelayMs);
    this.startTimer.unref();
    this.timer = setInterval(tick, this.options.intervalMs);
    this.timer.unref();
  }

  async stop() {
    if (this.startTimer) clearTimeout(this.startTimer);
    if (this.timer) clearInterval(this.timer);
    await this.active;
  }

  /** One pass over the plan; returns null when another instance holds the lock. */
  async runOnce(now = Date.now()): Promise<RetentionRun | null> {
    if (!(await this.locks.tryAcquire(LOCK_NAME, INSTANCE_ID, this.options.budgetMs + 60_000))) return null;
    const run: RetentionRun = { startedAt: Date.now(), finishedAt: 0, deleted: {}, complete: true, error: "" };
    const deadline = run.startedAt + this.options.budgetMs;
    try {
      const projects = this.plan.some((rule) => rule.perProject) ? await this.retention.listProjectIds() : [];
      plan: for (const rule of this.plan) {
        const before = now - rule.days * DAY_MS;
        const scopes: Array<string | null | undefined> = rule.perProject
          ? [...projects, ...(rule.includeUnassigned ? [null] : [])]
          : [undefined];
        for (const scope of scopes) {
          for (;;) {
            if (Date.now() >= deadline) {
              run.complete = false;
              break plan;
            }
            const deleted = await this.retention.purgeBatch(rule.target, before, this.options.batchSize, scope);
            if (deleted) run.deleted[rule.target] = (run.deleted[rule.target] ?? 0) + deleted;
            if (deleted < this.options.batchSize) break;
          }
        }
      }
    } catch (error) {
      run.error = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      run.finishedAt = Date.now();
      DataRetentionJob.last = run;
      const total = Object.values(run.deleted).reduce((sum, value) => sum + (value ?? 0), 0);
      if (total || run.error || !run.complete) console.info("[ADMIN data retention]", JSON.stringify(run));
      await this.locks.release(LOCK_NAME, INSTANCE_ID).catch(() => undefined);
    }
    return run;
  }
}
