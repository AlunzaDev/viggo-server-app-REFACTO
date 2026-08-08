import { randomUUID } from "node:crypto";
import { envs } from "../../../config";
import { StripePlugin } from "../../../config/plugins/stripe.plugin";
import { MobileOperationModel, PaymentModel } from "../../../data/mongo";
import { PensionModel } from "../../../data/mongo/models/pension/pension.schema";
import { PensionPassModel } from "../../../data/mongo/models/pension/pension-pass.schema";
import { PensionPassMongoDatasource } from "../../../infrastructure/datasources/pension/pension-pass.datasource.mongo";
import { PensionMongoDatasource } from "../../../infrastructure/datasources/pension/pension.datasource.mongo";
import { PensionPassRepositoryImpl } from "../../../infrastructure/repositories/pension/pension-pass.repository.impl";
import { PensionRepositoryImpl } from "../../../infrastructure/repositories/pension/pension.repository.impl";
import { OperationalIncidentService } from "../incidents/operational-incident.service";
import { PensionPassService } from "../pension/pension-pass.service";

type PaymentDocument = any;

export class FinancialReconciliationService {
  private static enabled = false;
  private static runningNow = false;
  private static lastRunStartedAt = 0;
  private static lastRunFinishedAt = 0;
  private static lastRunError = "";
  private running = false;
  private timer?: NodeJS.Timeout;
  private readonly pensionPassService = new PensionPassService(
    new PensionPassRepositoryImpl(new PensionPassMongoDatasource()),
    new PensionRepositoryImpl(new PensionMongoDatasource()),
  );

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
      const payments = await PaymentModel.find({
        stripePaymentIntentId: { $exists: true, $ne: "" },
        $or: [
          { status: "pending" },
          { status: "succeeded", reconciliationStatus: { $ne: "reconciled" } },
          { status: "succeeded", appliedOperationKey: { $in: [null, ""] } },
          { status: "succeeded", appliedOperationKey: { $exists: false } },
        ],
      })
        .sort({ paidAt: 1 })
        .limit(envs.FINANCIAL_RECONCILIATION_BATCH_SIZE);

      for (const payment of payments) {
        await this.reconcilePayment(payment).catch(async (error) => {
          await PaymentModel.updateOne(
            { _id: payment._id },
            {
              $set: {
                reconciliationStatus: "failed",
                reconciliationError:
                  error instanceof Error ? error.message : "Error de conciliacion",
              },
            },
          );
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

  private async reconcilePayment(payment: PaymentDocument): Promise<void> {
    const providerStatus = await this.getProviderStatus(String(payment.stripePaymentIntentId));
    if (providerStatus !== "succeeded") {
      await PaymentModel.updateOne(
        { _id: payment._id },
        { $set: { rawProviderStatus: providerStatus, reconciliationStatus: "pending" } },
      );
      return;
    }

    payment.status = "succeeded";
    payment.rawProviderStatus = providerStatus;
    if (!payment.paidAt) payment.paidAt = Date.now();
    await payment.save();

    if (payment.type === "ticket") {
      await this.reconcileTicketPayment(payment);
      return;
    }
    await this.reconcilePensionPayment(payment);
  }

  private async reconcileTicketPayment(payment: PaymentDocument): Promise<void> {
    const ticketId = String((payment.reference as { id?: unknown }).id ?? "");
    const userId = String(payment.user);
    const intentId = String(payment.stripePaymentIntentId);
    const source = await MobileOperationModel.findOne({
      userId,
      type: "CREATE_TICKET",
      "result.ticket.uid": ticketId,
    })
      .sort({ createdAt: -1 })
      .lean();

    if (!source) {
      throw new Error("No se encontro el ticket movil origen para aplicar el pago");
    }

    const now = Date.now();
    const operation = await MobileOperationModel.findOneAndUpdate(
      { idempotencyKey: `apply:${intentId}` },
      {
        $setOnInsert: {
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
        },
      },
      { new: true, upsert: true },
    );

    await PaymentModel.updateOne(
      { _id: payment._id },
      {
        $set: {
          appliedOperationKey: `apply:${intentId}`,
          appliedAt: now,
          reconciliationStatus: operation.status === "completed" ? "reconciled" : "pending",
          reconciledAt: operation.status === "completed" ? now : undefined,
          reconciliationError: "",
        },
      },
    );
  }

  private async reconcilePensionPayment(payment: PaymentDocument): Promise<void> {
    const pensionPassId = String((payment.reference as { id?: unknown }).id ?? "");
    const userId = String(payment.user);
    const operationKey = `reconcile:${String(payment.stripePaymentIntentId)}`;
    const claimed = await PaymentModel.findOneAndUpdate(
      {
        _id: payment._id,
        $or: [
          { appliedOperationKey: { $exists: false } },
          { appliedOperationKey: "" },
          { appliedOperationKey: operationKey },
        ],
      },
      { $set: { appliedOperationKey: operationKey, appliedAt: Date.now() } },
      { new: true },
    );
    if (!claimed) {
      await PaymentModel.updateOne(
        { _id: payment._id },
        { $set: { reconciliationStatus: "reconciled", reconciledAt: Date.now(), reconciliationError: "" } },
      );
      return;
    }

    const months = await this.resolvePensionMonths(claimed);
    if (claimed.type === "renewal") {
      await this.pensionPassService.renewPensionPass(userId, pensionPassId, months, operationKey);
    } else {
      await this.pensionPassService.contractPensionPass(userId, pensionPassId, operationKey);
    }
    await PaymentModel.updateOne(
      { _id: payment._id },
      { $set: { reconciliationStatus: "reconciled", reconciledAt: Date.now(), reconciliationError: "" } },
    );
  }

  private async resolvePensionMonths(payment: PaymentDocument): Promise<number> {
    const metadata = payment.metadata as { contractMonths?: unknown } | undefined;
    const metadataMonths = Number(metadata?.contractMonths);
    if (Number.isInteger(metadataMonths) && metadataMonths >= 1 && metadataMonths <= 24) {
      return metadataMonths;
    }
    const pass = await PensionPassModel.findById(
      String((payment.reference as { id?: unknown }).id ?? ""),
    ).lean();
    const pension = pass ? await PensionModel.findById(pass.pension).lean() : null;
    const price = Number(pension?.precio);
    const months = Number(payment.amount) / price;
    if (!Number.isInteger(months) || months < 1 || months > 24) {
      throw new Error("No se pudo resolver la vigencia pagada");
    }
    return months;
  }

  private async getProviderStatus(paymentIntentId: string): Promise<string> {
    if (envs.STRIPE_MOCK_ENABLED || !envs.STRIPE_ENABLED) {
      const payment = await PaymentModel.findOne({ stripePaymentIntentId: paymentIntentId }).lean();
      return String(payment?.status ?? "pending");
    }
    const intent = await StripePlugin.client.paymentIntents.retrieve(paymentIntentId);
    return intent.status;
  }
}
