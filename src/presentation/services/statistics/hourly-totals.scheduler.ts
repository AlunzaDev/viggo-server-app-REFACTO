import type { HourlyTotalsStore } from "../../../domain/statistics/hourly-totals";

/** Hours recomputed per transaction. */
const BATCH = 200;
/** Longest a tick keeps working: the next tick continues where it stopped. */
const TICK_BUDGET_MS = 20_000;
const INTERVAL_MS = 30_000;

/**
 * Keeps the statistics totals per hour up to date (docs/estadisticas-carga.md §5): marks what
 * changed and recomputes pending hours every 30 s, so a past hour lags at most about a minute.
 */
export class HourlyTotalsScheduler {
  private timer?: ReturnType<typeof setInterval>;
  private active?: Promise<void>;

  constructor(private readonly totals: HourlyTotalsStore) {}

  start() {
    const tick = () => {
      if (this.active) return;
      this.active = this.run().catch((error) => console.error("[ADMIN statistics]", error))
        .finally(() => { this.active = undefined; });
    };
    tick();
    this.timer = setInterval(tick, INTERVAL_MS);
    this.timer.unref();
  }

  async stop() {
    if (this.timer) clearInterval(this.timer);
    await this.active;
  }

  private async run() {
    const started = Date.now();
    while (Date.now() - started < TICK_BUDGET_MS) {
      if ((await this.totals.refresh(Date.now(), BATCH)) < BATCH) return;
    }
  }
}
