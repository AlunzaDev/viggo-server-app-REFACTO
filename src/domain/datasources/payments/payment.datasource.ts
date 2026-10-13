import {
  PaymentEntity,
  PaymentMethodDetails,
  PaymentParking,
  PaymentReference,
  PaymentStatus,
  PaymentType,
} from "../../entities/payments/payment.entity";

export type PaymentReconciliationStatus = "pending" | "reconciled" | "failed";

/**
 * Full payment as stored, including the internal fields used by idempotency and
 * reconciliation. PaymentEntity stays as the public shape for payment history.
 */
export interface PaymentRecord {
  id: string;
  user: string;
  type: PaymentType;
  concept: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  paidAt: number;
  stripePaymentIntentId?: string;
  idempotencyKey?: string;
  appliedOperationKey?: string;
  appliedAt?: number;
  reconciliationStatus?: PaymentReconciliationStatus;
  reconciledAt?: number;
  reconciliationError?: string;
  metadata?: Record<string, unknown>;
  paymentMethod?: PaymentMethodDetails;
  reference: PaymentReference;
  parking?: PaymentParking;
  rawProviderStatus?: string;
}

export type NewPaymentRecord = Omit<
  PaymentRecord,
  "id" | "appliedOperationKey" | "appliedAt" | "reconciliationStatus" | "reconciledAt" | "reconciliationError"
>;

export type PaymentReconciliationUpdate = Partial<
  Pick<
    PaymentRecord,
    | "rawProviderStatus"
    | "appliedOperationKey"
    | "appliedAt"
    | "reconciliationStatus"
    | "reconciledAt"
    | "reconciliationError"
  >
>;

export interface PaymentRecordLookup {
  userId: string;
  stripePaymentIntentId: string;
  referenceId: string;
  type?: PaymentType;
}

export abstract class PaymentDatasource {
  abstract findRecordByIdempotencyKey(idempotencyKey: string): Promise<PaymentRecord | null>;
  abstract findRecordByStripePaymentIntentId(stripePaymentIntentId: string): Promise<PaymentRecord | null>;
  abstract findRecordForUser(lookup: PaymentRecordLookup): Promise<PaymentRecord | null>;
  abstract createRecord(payment: NewPaymentRecord): Promise<PaymentRecord>;
  abstract markSucceeded(
    id: string,
    update: { rawProviderStatus: string; paidAt: number },
  ): Promise<PaymentRecord | null>;
  /**
   * Atomically assigns operationKey to the payment if it has no applied operation
   * yet (or already has this one). Returns null if another operation owns it.
   */
  abstract claimForOperation(id: string, operationKey: string, appliedAt: number): Promise<PaymentRecord | null>;
  abstract updateReconciliation(id: string, update: PaymentReconciliationUpdate): Promise<void>;
  /** Stripe payments that are pending or succeeded but not yet reconciled/applied, oldest first. */
  abstract findPendingReconciliation(limit: number): Promise<PaymentRecord[]>;

  /** Public JSON shape used by the mobile payment history endpoints. */
  abstract getSerializedByUser(
    userId: string,
    options: { page: number; limit: number; from?: number; to?: number },
  ): Promise<{ total: number; payments: Record<string, unknown>[] }>;
  abstract findSerializedByIdForUser(id: string, userId: string): Promise<Record<string, unknown> | null>;

  abstract create(
    payment: Omit<PaymentEntity, "id">,
  ): Promise<PaymentEntity>;

  abstract findById(id: string): Promise<PaymentEntity | null>;

  abstract findByStripePaymentIntentId(
    stripePaymentIntentId: string,
  ): Promise<PaymentEntity | null>;

  abstract getByUser(userId: string, options?: {
    page?: number;
    limit?: number;
    type?: PaymentEntity["type"];
    status?: PaymentEntity["status"];
    search?: string;
    from?: number;
    to?: number;
  }): Promise<PaymentEntity[]>;

  abstract countByUser(userId: string, options?: {
    type?: PaymentEntity["type"];
    status?: PaymentEntity["status"];
    search?: string;
    from?: number;
    to?: number;
  }): Promise<number>;

  abstract update(
    id: string,
    payment: Partial<Omit<PaymentEntity, "id">>,
  ): Promise<PaymentEntity | null>;
}
