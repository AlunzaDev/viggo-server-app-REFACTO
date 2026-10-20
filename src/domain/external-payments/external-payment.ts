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
  /** Catalog id of the provider; stored on its orders. */
  readonly code: string;
  /** `parkingId` is the parking's id in the provider's system (externalParkingId). */
  resolveOrder(qr: string, parkingId: string): Promise<ExternalQuote>;
  /** Must deduplicate by idempotencyKey, including after an ambiguous timeout. */
  confirmPayment(input: {
    reference: string; paymentReference: string; amountMinor: number;
    currency: string; idempotencyKey: string;
  }): Promise<{ confirmationReference: string }>;
  /**
   * Whether the provider already applied the confirmation sent with this key (e.g. it applied
   * it but its answer was lost). Providers without the query answer "unsupported".
   */
  confirmationStatus?(input: { reference: string; idempotencyKey: string }): Promise<ConfirmationStatus>;
}

export type ConfirmationStatus =
  | { state: "applied"; confirmationReference: string }
  | { state: "not_applied" }
  | { state: "unsupported" };

export type ExternalOrderStatus = "quoted" | "payment_pending" | "paid" | "confirmed" | "confirmation_failed" | "expired" | "refunded";
export interface ExternalOrder {
  id: string;
  provider: string;
  reference: string;
  userId: string;
  /** Parking (Viggo project) where the user scanned the ticket. */
  proyectoId: string | null;
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

export interface ExternalOrderFilters {
  status?: ExternalOrderStatus; provider?: string; userId?: string; from?: number; to?: number;
}
export interface ExternalOrderAdmin extends ExternalOrder {
  lastError: string; nextRetryAt: number; leaseUntil: number | null; createdAt: number;
}
export interface ExternalOrderEvent { id: string; kind: string; detail: string; createdAt: number }

export interface ExternalPaymentGateway {
  create(order: ExternalOrder): Promise<ExternalIntent>;
  retrieve(id: string): Promise<ExternalIntent>;
  cancel(id: string): Promise<ExternalIntent>;
}

export abstract class ExternalOrderRepository {
  abstract listAdmin(filters: ExternalOrderFilters, page: number, limit: number): Promise<{ total: number; orders: ExternalOrderAdmin[] }>;
  abstract events(id: string, page: number, limit: number): Promise<{ total: number; events: ExternalOrderEvent[] }>;
  abstract retryConfirmation(id: string, actorId: string, reason: string, intent: ExternalIntent, now: number): Promise<void>;
  /**
   * Returns the live order for the quote's reference, or creates one. A quote nobody started
   * paying is replaced once it expires, so the ticket can be quoted (and paid) again.
   */
  abstract saveQuote(userId: string, provider: string, quote: ExternalQuote, now: number, proyectoId?: string | null): Promise<ExternalOrder>;
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
  /**
   * The provider says it already applied the confirmation of an order the worker holds (lease)
   * or of one in review (no lease, actor given). Same effects as `confirmed`.
   */
  abstract confirmedByStatusCheck(id: string, reference: string, now: number, by: { lease: string } | { actorId: string }): Promise<boolean>;
}

/** The integration that charges in a parking, and the parking's id in the provider's system. */
export interface ProjectPaymentProvider {
  providerId: string;
  parkingId: string;
  provider: ExternalPaymentProvider;
}

/**
 * Integrations built from the payment provider catalog. Configuration is read on every call,
 * so a provider can be reconfigured (URL, credential, active) without a restart.
 */
export abstract class ExternalProviderDirectory {
  /** The provider of the parking; a CustomError explains why it cannot charge there. */
  abstract forProject(proyectoId: string): Promise<ProjectPaymentProvider>;
  /**
   * A catalog provider with its current configuration (to confirm its orders). `includeInactive`
   * only for the connection test, which runs before activating it.
   */
  abstract forProvider(providerId: string, options?: { includeInactive?: boolean }): Promise<ExternalPaymentProvider>;
}
