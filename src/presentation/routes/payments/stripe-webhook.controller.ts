import { randomUUID } from "node:crypto";
import { Request, Response } from "express";
import { envs } from "../../../config";
import { StripePlugin } from "../../../config/plugins/stripe.plugin";
import type { MobileOperationRepository } from "../../../domain/repositories/mobile/mobile-operation.repository";
import type { PaymentRepository } from "../../../domain/repositories/payments/payment.repository";

export class StripeWebhookController {
  constructor(
    private readonly payments: PaymentRepository,
    private readonly operations: MobileOperationRepository,
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
