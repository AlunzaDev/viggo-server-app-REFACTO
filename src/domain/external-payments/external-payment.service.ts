import { randomUUID } from "node:crypto";
import { CustomError } from "../errors/custom.error";
import { ExternalOrderRepository, ExternalProviderDirectory, type ExternalIntent, type ExternalOrder, type ExternalPaymentGateway } from "./external-payment";

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
/**
 * Final provider answers to a confirmation (already paid, amount mismatch, unknown ticket,
 * rejected request): retrying cannot help, the order goes straight to review.
 */
const isFinalConfirmationError = (error: unknown) =>
  error instanceof CustomError && (error.statusCode === 409 || error.code === "EXTERNAL_PROVIDER_REJECTED");

const validText = (value: unknown): value is string => typeof value === "string" && !!value.trim() && value.length <= 256;

export class ExternalPaymentService {
  constructor(
    private readonly orders: ExternalOrderRepository,
    private readonly directory: ExternalProviderDirectory,
    private readonly gateway: ExternalPaymentGateway,
    private readonly now = Date.now,
  ) {}

  /**
   * Quotes the ticket of a QR scanned in a parking. The provider comes from the parking
   * (detected by the app), never from the QR or the client.
   */
  async resolve(userId: string, projectId: unknown, qr: unknown) {
    if (typeof projectId !== "string" || !isUuid(projectId)) throw CustomError.badRequest("Estacionamiento invalido");
    if (typeof qr !== "string" || !qr.trim() || qr.length > 4096) throw CustomError.badRequest("QR invalido");
    const { provider, providerId, parkingId } = await this.directory.forProject(projectId);
    const quote = await provider.resolveOrder(qr.trim(), parkingId);
    if (!quote || !validText(quote.reference) || !validText(quote.ticket) || !validText(quote.parking?.id) || !validText(quote.parking?.name) ||
        !Number.isSafeInteger(quote.amountMinor) || quote.amountMinor < 1000 || quote.amountMinor > 99_999_999 ||
        quote.currency !== "MXN" || !Number.isSafeInteger(quote.expiresAt) || quote.expiresAt > 8.64e15) {
      throw new CustomError(502, "Cotizacion invalida del proveedor", "INVALID_EXTERNAL_QUOTE");
    }
    if (quote.status !== "payable" || quote.expiresAt <= this.now()) throw CustomError.conflict("Ticket pagado, expirado o no disponible");
    const order = await this.orders.saveQuote(userId, providerId, quote, this.now(), projectId);
    if (order.userId !== userId) {
      throw CustomError.conflict("Este ticket ya se esta pagando desde otra cuenta", undefined, "EXTERNAL_ORDER_TAKEN");
    }
    if (order.expiresAt <= this.now() || !["quoted", "payment_pending"].includes(order.status)) {
      throw CustomError.conflict("La orden ya no esta disponible para cobro");
    }
    return this.publicOrder(order);
  }

  async get(userId: string, id: string) {
    return this.publicOrder(await this.owned(userId, id));
  }

  async retryConfirmation(id: string, actorId: string, reason: unknown) {
    if (!validText(reason) || reason.trim().length < 10) throw CustomError.badRequest("Indica un motivo de 10 a 256 caracteres");
    const order = await this.orders.find(id);
    if (!order) throw CustomError.notFound("Orden externa no encontrada");
    if (order.status !== "confirmation_failed" || !order.stripePaymentIntentId) throw CustomError.conflict("Solo se reintenta una confirmacion fallida de un cobro existente");
    // Retrieve only: a manual retry can never create another charge.
    const intent = await this.gateway.retrieve(order.stripePaymentIntentId);
    this.validateIntent(order, intent);
    if (intent.status !== "succeeded") throw CustomError.conflict("Stripe no confirma el pago");
    await this.orders.retryConfirmation(id, actorId, reason.trim(), intent, this.now());
  }

  async createPaymentIntent(userId: string, id: string) {
    let order = await this.owned(userId, id);
    if (!["quoted", "payment_pending"].includes(order.status) || order.expiresAt <= this.now()) {
      throw CustomError.conflict("La orden ya no esta disponible para cobro");
    }
    order = await this.orders.beginIntent(id, this.now());
    const intent = await this.ensureIntent(order);
    if (intent.status === "succeeded") await this.acceptSucceeded(intent);
    if (intent.status === "canceled") throw CustomError.conflict("El cobro fue cancelado; requiere revision");
    return { orderId: id, paymentIntentId: intent.id, paymentIntent: intent.clientSecret, status: intent.status };
  }

  /** Only called with a signature-verified Stripe event or a server-side Stripe retrieval. */
  async acceptSucceeded(intent: ExternalIntent) {
    const order = isUuid(intent.orderId) ? await this.orders.find(intent.orderId) : null;
    if (!order) throw CustomError.notFound("Orden externa no encontrada");
    this.validateIntent(order, intent);
    if (intent.status !== "succeeded") throw CustomError.conflict("Stripe no confirma el pago");
    await this.orders.markPaid(order, intent, this.now());
  }

  /** Bounded reconciliation: recover missing webhooks and retry provider delivery, never charge again. */
  async runOnce(limit = 50) {
    for (const candidate of await this.orders.pending(limit)) {
      try {
        let order = candidate;
        if (order.status === "quoted") {
          if (order.expiresAt <= this.now()) await this.orders.expire(order.id);
          continue;
        }
        if (order.status === "payment_pending") {
          let intent = await this.ensureIntent(order);
          if (intent.status === "succeeded") await this.acceptSucceeded(intent);
          else if (order.expiresAt <= this.now()) {
            if (intent.status !== "canceled") intent = await this.gateway.cancel(intent.id);
            this.validateIntent(order, intent);
            if (intent.status === "succeeded") await this.acceptSucceeded(intent);
            else if (intent.status === "canceled") await this.orders.expire(order.id);
          }
          order = (await this.orders.find(order.id))!;
          if (order.status === "payment_pending") await this.orders.deferPending(order.id, this.now());
        }
        if (order.status !== "paid") continue;
        const lease = randomUUID();
        const claimed = await this.orders.claimConfirmation(order.id, lease, this.now());
        if (!claimed) continue;
        if (claimed.attempts > 8) {
          await this.orders.confirmationFailed(claimed.id, lease, this.now(), 8);
          continue;
        }
        try {
          const provider = await this.directory.forProvider(claimed.provider);
          const result = await provider.confirmPayment({
            reference: claimed.reference, paymentReference: claimed.stripePaymentIntentId!,
            amountMinor: claimed.amountMinor, currency: claimed.currency,
            idempotencyKey: `external-confirm:${claimed.id}`,
          });
          if (!result || !validText(result.confirmationReference)) throw new Error("Invalid confirmation");
          await this.orders.confirmed(claimed.id, lease, result.confirmationReference, this.now());
        } catch (error) {
          // A final answer exhausts the attempts now; anything else is retried with backoff.
          const maxAttempts = isFinalConfirmationError(error) ? claimed.attempts : 8;
          await this.orders.confirmationFailed(claimed.id, lease, this.now(), maxAttempts);
        }
      } catch (error) {
        // Persist a diagnostic without recording QRs, credentials or provider response bodies.
        const code = error instanceof CustomError ? error.code : "EXTERNAL_RECONCILIATION_ERROR";
        await this.orders.flagReview(candidate.id, code, this.now());
      }
    }
  }

  private async ensureIntent(order: ExternalOrder) {
    if (!order.stripePaymentIntentId && (!order.intentStartedAt || this.now() - order.intentStartedAt >= 23 * 60 * 60_000)) {
      // Stripe may prune idempotency keys after 24h. Never recreate an ambiguous old charge.
      await this.orders.flagReview(order.id, "STRIPE_INTENT_RECOVERY_WINDOW_EXCEEDED", this.now());
      throw CustomError.conflict("El cobro requiere revision manual", undefined, "STRIPE_INTENT_RECOVERY_WINDOW_EXCEEDED");
    }
    const intent = order.stripePaymentIntentId
      ? await this.gateway.retrieve(order.stripePaymentIntentId)
      : await this.gateway.create(order);
    this.validateIntent(order, intent);
    await this.orders.attachIntent(order, intent);
    return intent;
  }

  private validateIntent(order: ExternalOrder, intent: ExternalIntent) {
    if (intent.orderId !== order.id || intent.userId !== order.userId || intent.amountMinor !== order.amountMinor ||
        intent.currency.toUpperCase() !== order.currency || (order.stripePaymentIntentId && order.stripePaymentIntentId !== intent.id)) {
      throw CustomError.conflict("El pago no corresponde a la orden", undefined, "EXTERNAL_PAYMENT_MISMATCH");
    }
  }

  private async owned(userId: string, id: string) {
    if (!isUuid(id)) throw CustomError.badRequest("Orden invalida");
    const order = await this.orders.find(id);
    if (!order) throw CustomError.notFound("Orden externa no encontrada");
    this.assertOwner(order, userId);
    return order;
  }

  private assertOwner(order: ExternalOrder, userId: string) {
    if (order.userId !== userId) throw CustomError.notFound("Orden externa no encontrada");
  }

  private publicOrder(order: ExternalOrder) {
    return { id: order.id, provider: order.provider, proyectoId: order.proyectoId, ticket: order.ticket,
      parking: { id: order.parkingId, name: order.parkingName }, amountMinor: order.amountMinor,
      currency: order.currency, expiresAt: order.expiresAt, status: order.status };
  }
}
