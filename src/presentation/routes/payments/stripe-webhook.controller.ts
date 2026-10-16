import { randomUUID } from "node:crypto";
import type { ExternalPaymentService } from "../../../domain/external-payments/external-payment.service";
import { externalIntent } from "../../../infrastructure/external-payments/stripe-external.gateway";
import { Request, Response } from "express";
import { envs } from "../../../config";
import { StripePlugin } from "../../../config/plugins/stripe.plugin";
import { CustomError } from "../../../domain/errors/custom.error";
import type { MobileOperationRepository } from "../../../domain/repositories/mobile/mobile-operation.repository";
import type { PaymentRepository } from "../../../domain/repositories/payments/payment.repository";

export class StripeWebhookController {
  constructor(
    private readonly payments: PaymentRepository,
    private readonly operations: MobileOperationRepository,
    private readonly externalPayments?: ExternalPaymentService,
  ) {}

  handle = async (req: Request, res: Response) => {
    try {
      const signature = req.header("stripe-signature");
      if (!signature || !envs.STRIPE_WEBHOOK_SECRET) {
        return res.status(400).json({ error: "Webhook no configurado" });
      }
      const event = StripePlugin.client.webhooks.constructEvent(
        req.body,
        signature,
        envs.STRIPE_WEBHOOK_SECRET,
      );
      if (event.type !== "payment_intent.succeeded") {
        return res.status(200).json({ received: true });
      }
      const intent = event.data.object;
      if (intent.metadata.type === "external") {
        if (!this.externalPayments) throw new Error("External payments handler unavailable");
        try {
          await this.externalPayments.acceptSucceeded(externalIntent(intent));
        } catch (error) {
          // The order is stored before its charge is created, so an unknown order means the
          // event belongs to another environment sharing this Stripe account: acknowledge it
          // instead of making Stripe retry for days. Any other failure is still retried.
          if (error instanceof CustomError && error.statusCode === 404) {
            return res.status(200).json({ received: true, ignored: true });
          }
          throw error;
        }
        return res.status(200).json({ received: true });
      }
      const pending = await this.payments.findRecordByStripePaymentIntentId(intent.id);
      if (!pending) return res.status(200).json({ received: true, ignored: true });
      const payment = await this.payments.markSucceeded(pending.id, {
        rawProviderStatus: intent.status,
        paidAt: Date.now(),
      });
      if (!payment) return res.status(200).json({ received: true, ignored: true });

      const ticketId = String(payment.reference.id ?? "");
      const userId = String(payment.user);
      const source = await this.operations.findLatestTicketSource(userId, ticketId);
      if (source) {
        const now = Date.now();
        await this.operations.createIfAbsent({
          operationId: randomUUID(),
          idempotencyKey: `apply:${intent.id}`,
          type: "APPLY_TICKET_PAYMENT",
          installationId: source.installationId,
          proyectoId: source.proyectoId,
          userId,
          payload: {
            ticketId,
            providerReference: intent.id,
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
      }
      return res.status(200).json({ received: true });
    } catch (error) {
      return res.status(400).json({
        error: error instanceof Error ? error.message : "Webhook invalido",
      });
    }
  };
}
