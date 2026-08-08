import { randomUUID } from "node:crypto";
import { Request, Response } from "express";
import { envs } from "../../../config";
import { StripePlugin } from "../../../config/plugins/stripe.plugin";
import { MobileOperationModel, PaymentModel } from "../../../data/mongo";

export class StripeWebhookController {
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
      const payment = await PaymentModel.findOne({ stripePaymentIntentId: intent.id });
      if (!payment) return res.status(200).json({ received: true, ignored: true });
      payment.status = "succeeded";
      payment.rawProviderStatus = intent.status;
      payment.paidAt = Date.now();
      await payment.save();

      const ticketId = String((payment.reference as { id?: unknown }).id ?? "");
      const userId = String(payment.user);
      const source = await MobileOperationModel.findOne({
        userId,
        type: "CREATE_TICKET",
        "result.ticket.uid": ticketId,
      }).sort({ createdAt: -1 }).lean();
      if (source) {
        const now = Date.now();
        await MobileOperationModel.updateOne(
          { idempotencyKey: `apply:${intent.id}` },
          {
            $setOnInsert: {
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
            },
          },
          { upsert: true },
        );
      }
      return res.status(200).json({ received: true });
    } catch (error) {
      return res.status(400).json({
        error: error instanceof Error ? error.message : "Webhook invalido",
      });
    }
  };
}
