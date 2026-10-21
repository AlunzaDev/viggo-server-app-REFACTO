import type { ExternalPaymentService } from "./external-payment.service";

export class ExternalPaymentWorker {
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;
  constructor(private readonly service: ExternalPaymentService) {}
  start() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      if (this.running) return;
      this.running = this.service.runOnce().catch(error => {
        console.error("[EXTERNAL PAYMENTS] Reconciliation failed", error instanceof Error ? error.name : "UnknownError");
      }).finally(() => { this.running = undefined; });
    }, 15_000);
    this.timer.unref();
  }
  async stop() {
    clearInterval(this.timer);
    this.timer = undefined;
    await this.running;
  }
}
