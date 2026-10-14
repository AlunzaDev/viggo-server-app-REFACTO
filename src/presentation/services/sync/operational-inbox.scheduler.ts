import { OperationalInboxProcessor } from "../../../infrastructure/datasources/sync/operational-inbox.processor";

export class OperationalInboxScheduler {
  private timer?: ReturnType<typeof setInterval>;
  private active?: Promise<void>;
  private readonly processor = new OperationalInboxProcessor();
  start() {
    const tick = () => {
      if (this.active) return;
      this.active = this.processor.processPending().catch(error => console.error("[ADMIN inbox]", error))
        .finally(() => { this.active = undefined; });
    };
    tick();
    this.timer = setInterval(tick, 5_000);
    this.timer.unref();
  }
  async stop() {
    if (this.timer) clearInterval(this.timer);
    await this.active;
  }
}
