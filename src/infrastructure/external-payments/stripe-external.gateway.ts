import type Stripe from "stripe";
import { envs } from "../../config";
import { StripePlugin } from "../../config/plugins/stripe.plugin";
import { CustomError } from "../../domain/errors/custom.error";
import type { ExternalIntent, ExternalOrder, ExternalPaymentGateway, ExternalRefund } from "../../domain/external-payments/external-payment";

export const externalIntent = (intent: Stripe.PaymentIntent): ExternalIntent => ({
  id: intent.id, clientSecret: intent.client_secret, status: intent.status,
  amountMinor: intent.amount, currency: intent.currency,
  orderId: intent.metadata.externalOrderId ?? "", userId: intent.metadata.usuario ?? "",
});

export class StripeExternalGateway implements ExternalPaymentGateway {
  private get stripe() {
    // No implicit mock or successful fake charge in a runtime endpoint.
    if (!envs.STRIPE_ENABLED || envs.STRIPE_MOCK_ENABLED) throw new CustomError(503, "Stripe no habilitado para pagos externos", "EXTERNAL_STRIPE_DISABLED");
    return StripePlugin.client;
  }

  async create(order: ExternalOrder) {
    return externalIntent(await this.stripe.paymentIntents.create({
      amount: order.amountMinor, currency: order.currency.toLowerCase(),
      automatic_payment_methods: { enabled: true },
      metadata: { type: "external", externalOrderId: order.id, usuario: order.userId, provider: order.provider },
    }, { idempotencyKey: `external-intent:${order.id}` }));
  }
  async retrieve(id: string) { return externalIntent(await this.stripe.paymentIntents.retrieve(id)); }
  async refund(intentId: string, orderId: string): Promise<ExternalRefund> {
    // One key per order: repeating the request returns the same refund instead of a second one.
    const refund = await this.stripe.refunds.create({ payment_intent: intentId, metadata: { type: "external", externalOrderId: orderId } },
      { idempotencyKey: `external-refund:${orderId}` });
    return { id: refund.id, status: refund.status ?? "", amountMinor: refund.amount };
  }
  async cancel(id: string) {
    try { return externalIntent(await this.stripe.paymentIntents.cancel(id)); }
    catch {
      // Payment may have succeeded while expiration was attempting cancellation.
      const intent = await this.retrieve(id);
      if (!["succeeded", "canceled"].includes(intent.status)) throw CustomError.conflict("El cobro aun no puede cancelarse");
      return intent;
    }
  }
}
