import { randomUUID } from "node:crypto";
import { envs } from "../../../config";
import { StripePlugin } from "../../../config/plugins/stripe.plugin";
import type { PaymentRecord } from "../../../domain/datasources/payments/payment.datasource";
import type { MobileOperationRepository } from "../../../domain/repositories/mobile/mobile-operation.repository";
import type { PaymentRepository } from "../../../domain/repositories/payments/payment.repository";
import type { PensionPassRepository } from "../../../domain/repositories/pension/pension-pass.repository";
import type { PensionRepository } from "../../../domain/repositories/pension/pension.repository";
import { OperationalIncidentService } from "../incidents/operational-incident.service";
import { PensionPassService } from "../pension/pension-pass.service";

export class FinancialReconciliationService {
  private static enabled = false;
  private static runningNow = false;
  private static lastRunStartedAt = 0;
  private static lastRunFinishedAt = 0;
  private static lastRunError = "";
  private running = false;
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly payments: PaymentRepository,
    private readonly operations: MobileOperationRepository,
    private readonly pensionPasses: PensionPassRepository,
    private readonly pensions: PensionRepository,
    private readonly pensionPassService: PensionPassService,
  ) {}

  start(): void {
    if (!envs.FINANCIAL_RECONCILIATION_WORKER_ENABLED) {
      FinancialReconciliationService.enabled = false;
      console.log("[FINANCIAL] Reconciliation worker disabled");
      return;
    }
    FinancialReconciliationService.enabled = true;
    const intervalMs = envs.FINANCIAL_RECONCILIATION_INTERVAL_MINUTES * 60_000;
    this.timer = setInterval(() => {
      this.runOnce().catch((error) => {
        console.error("[FINANCIAL] Reconciliation worker failed", error);
        const message = error instanceof Error ? error.message : "Error de conciliacion financiera";
        FinancialReconciliationService.lastRunError = message;
        void OperationalIncidentService.open({
          incidentKey: "financial-worker-failed",
          type: "FINANCIAL_WORKER_FAILED",
          severity: "critical",
          source: "financial-reconciliation-worker",
          message,
        });
      });
    }, intervalMs);
    this.timer.unref?.();
    console.log(
      `[FINANCIAL] Reconciliation worker enabled every ${envs.FINANCIAL_RECONCILIATION_INTERVAL_MINUTES} minutes`,
    );
  }

  async runOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    FinancialReconciliationService.runningNow = true;
    FinancialReconciliationService.lastRunStartedAt = Date.now();
    try {
      const payments = await this.payments.findPendingReconciliation(
        envs.FINANCIAL_RECONCILIATION_BATCH_SIZE,
      );

      for (const payment of payments) {
        await this.reconcilePayment(payment).catch(async (error) => {
          await this.payments.updateReconciliation(payment.id, {
            reconciliationStatus: "failed",
            reconciliationError:
              error instanceof Error ? error.message : "Error de conciliacion",
          });
        });
      }
      FinancialReconciliationService.lastRunError = "";
      await OperationalIncidentService.resolve("financial-worker-failed");
    } finally {
      this.running = false;
      FinancialReconciliationService.runningNow = false;
      FinancialReconciliationService.lastRunFinishedAt = Date.now();
    }
  }

  static getHealthSnapshot() {
    return {
      status: this.enabled ? "ok" : "degraded",
      enabled: this.enabled,
      runningNow: this.runningNow,
      intervalMinutes: envs.FINANCIAL_RECONCILIATION_INTERVAL_MINUTES,
      batchSize: envs.FINANCIAL_RECONCILIATION_BATCH_SIZE,
      lastRunStartedAt: this.lastRunStartedAt || null,
      lastRunFinishedAt: this.lastRunFinishedAt || null,
      lastRunError: this.lastRunError,
    };
  }

  private async reconcilePayment(pending: PaymentRecord): Promise<void> {
    const providerStatus = await this.getProviderStatus(String(pending.stripePaymentIntentId));
    if (providerStatus !== "succeeded") {
      await this.payments.updateReconciliation(pending.id, {
        rawProviderStatus: providerStatus,
        reconciliationStatus: "pending",
      });
      return;
    }

    const payment = await this.payments.markSucceeded(pending.id, {
      rawProviderStatus: providerStatus,
      paidAt: pending.paidAt || Date.now(),
    });
    if (!payment) return;

    if (payment.type === "ticket") {
      await this.reconcileTicketPayment(payment);
      return;
    }
    await this.reconcilePensionPayment(payment);
  }

  private async reconcileTicketPayment(payment: PaymentRecord): Promise<void> {
    const ticketId = String(payment.reference.id ?? "");
    const userId = String(payment.user);
    const intentId = String(payment.stripePaymentIntentId);
    const source = await this.operations.findLatestTicketSource(userId, ticketId);

    if (!source) {
      throw new Error("No se encontro el ticket movil origen para aplicar el pago");
    }

    const now = Date.now();
    const operation = await this.operations.createIfAbsent({
      operationId: randomUUID(),
      idempotencyKey: `apply:${intentId}`,
      type: "APPLY_TICKET_PAYMENT",
      installationId: source.installationId,
      proyectoId: source.proyectoId,
      userId,
      payload: {
        ticketId,
        providerReference: intentId,
        amount: payment.amount,
        currency: payment.currency,
        paidAt: payment.paidAt,
      },
      status: "pending",
      attempts: 0,
      maxAttempts: 12,
      nextRetryAt: now,
      createdAt: now,
      updatedAt: now,
    });

    await this.payments.updateReconciliation(payment.id, {
      appliedOperationKey: `apply:${intentId}`,
      appliedAt: now,
      reconciliationStatus: operation.status === "completed" ? "reconciled" : "pending",
      reconciledAt: operation.status === "completed" ? now : undefined,
      reconciliationError: "",
    });
  }

  private async reconcilePensionPayment(payment: PaymentRecord): Promise<void> {
    const pensionPassId = String(payment.reference.id ?? "");
    const userId = String(payment.user);
    const operationKey = `reconcile:${String(payment.stripePaymentIntentId)}`;
    const claimed = await this.payments.claimForOperation(payment.id, operationKey, Date.now());
    if (!claimed) {
      await this.payments.updateReconciliation(payment.id, {
        reconciliationStatus: "reconciled",
        reconciledAt: Date.now(),
        reconciliationError: "",
      });
      return;
    }

    const months = await this.resolvePensionMonths(claimed);
    if (claimed.type === "renewal") {
      await this.pensionPassService.renewPensionPass(userId, pensionPassId, months, operationKey);
    } else {
      await this.pensionPassService.contractPensionPass(userId, pensionPassId, operationKey);
    }
    await this.payments.updateReconciliation(payment.id, {
      reconciliationStatus: "reconciled",
      reconciledAt: Date.now(),
      reconciliationError: "",
    });
  }

  private async resolvePensionMonths(payment: PaymentRecord): Promise<number> {
    const metadata = payment.metadata as { contractMonths?: unknown } | undefined;
    const metadataMonths = Number(metadata?.contractMonths);
    if (Number.isInteger(metadataMonths) && metadataMonths >= 1 && metadataMonths <= 24) {
      return metadataMonths;
    }
    const pass = await this.pensionPasses.findById(String(payment.reference.id ?? ""));
    const pension = pass ? await this.pensions.findById(pass.pension) : null;
    const price = Number(pension?.precio);
    const months = Number(payment.amount) / price;
    if (!Number.isInteger(months) || months < 1 || months > 24) {
      throw new Error("No se pudo resolver la vigencia pagada");
    }
    return months;
  }

  private async getProviderStatus(paymentIntentId: string): Promise<string> {
    if (envs.STRIPE_MOCK_ENABLED || !envs.STRIPE_ENABLED) {
      const payment = await this.payments.findRecordByStripePaymentIntentId(paymentIntentId);
      return String(payment?.status ?? "pending");
    }
    const intent = await StripePlugin.client.paymentIntents.retrieve(paymentIntentId);
    return intent.status;
  }
}
