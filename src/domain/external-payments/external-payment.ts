/** Amounts are integer minor units. Initially only MXN (two decimals) is supported. */
export interface ExternalQuote {
  reference: string;
  ticket: string;
  parking: { id: string; name: string };
  amountMinor: number;
  currency: string;
  expiresAt: number;
  status: "payable" | "paid" | "expired";
}

export interface ExternalPaymentProvider {
  readonly code: string;
  resolveOrder(qr: string): Promise<ExternalQuote>;
  /** Must deduplicate by idempotencyKey, including after an ambiguous timeout. */
  confirmPayment(input: {
    reference: string; paymentReference: string; amountMinor: number;
    currency: string; idempotencyKey: string;
  }): Promise<{ confirmationReference: string }>;
}

export type ExternalOrderStatus = "quoted" | "payment_pending" | "paid" | "confirmed" | "confirmation_failed" | "expired" | "refunded";
export interface ExternalOrder {
  id: string;
  provider: string;
  reference: string;
  userId: string;
  ticket: string;
  parkingId: string;
  parkingName: string;
  amountMinor: number;
  currency: string;
  expiresAt: number;
  status: ExternalOrderStatus;
  stripePaymentIntentId: string | null;
  intentStartedAt: number | null;
  attempts: number;
  confirmationReference: string;
}

export interface ExternalIntent {
  id: string; clientSecret: string | null; status: string;
  amountMinor: number; currency: string;
  orderId: string; userId: string;
}

export interface ExternalPaymentGateway {
  create(order: ExternalOrder): Promise<ExternalIntent>;
  retrieve(id: string): Promise<ExternalIntent>;
  cancel(id: string): Promise<ExternalIntent>;
}

export abstract class ExternalOrderRepository {
  abstract saveQuote(userId: string, provider: string, quote: ExternalQuote): Promise<ExternalOrder>;
  abstract find(id: string): Promise<ExternalOrder | null>;
  abstract beginIntent(id: string, now: number): Promise<ExternalOrder>;
  abstract attachIntent(order: ExternalOrder, intent: ExternalIntent): Promise<void>;
  /** Order and payments history are updated in a single transaction. */
  abstract markPaid(order: ExternalOrder, intent: ExternalIntent, now: number): Promise<void>;
  abstract expire(id: string): Promise<void>;
  abstract deferPending(id: string, now: number): Promise<void>;
  abstract pending(limit: number): Promise<ExternalOrder[]>;
  abstract claimConfirmation(id: string, lease: string, now: number): Promise<ExternalOrder | null>;
  abstract confirmed(id: string, lease: string, reference: string, now: number): Promise<void>;
  abstract confirmationFailed(id: string, lease: string, now: number, maxAttempts: number): Promise<void>;
  abstract flagReview(id: string, reason: string, now: number): Promise<void>;
}
