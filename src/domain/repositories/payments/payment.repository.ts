import type {
  NewPaymentRecord,
  PaymentReconciliationUpdate,
  PaymentRecord,
  PaymentRecordLookup,
} from "../../datasources/payments/payment.datasource";
import { PaymentEntity } from "../../entities/payments/payment.entity";

export abstract class PaymentRepository {
  abstract findRecordByIdempotencyKey(idempotencyKey: string): Promise<PaymentRecord | null>;
  abstract findRecordByStripePaymentIntentId(stripePaymentIntentId: string): Promise<PaymentRecord | null>;
  abstract findRecordForUser(lookup: PaymentRecordLookup): Promise<PaymentRecord | null>;
  abstract createRecord(payment: NewPaymentRecord): Promise<PaymentRecord>;
  abstract markSucceeded(
    id: string,
    update: { rawProviderStatus: string; paidAt: number },
  ): Promise<PaymentRecord | null>;
  abstract claimForOperation(id: string, operationKey: string, appliedAt: number): Promise<PaymentRecord | null>;
  abstract updateReconciliation(id: string, update: PaymentReconciliationUpdate): Promise<void>;
  abstract findPendingReconciliation(limit: number): Promise<PaymentRecord[]>;
  abstract getSerializedByUser(
    userId: string,
    options: { page: number; limit: number; from?: number; to?: number },
  ): Promise<{ total: number; payments: Record<string, unknown>[] }>;
  abstract findSerializedByIdForUser(id: string, userId: string): Promise<Record<string, unknown> | null>;

  abstract create(payment: Omit<PaymentEntity, "id">): Promise<PaymentEntity>;

  abstract findById(id: string): Promise<PaymentEntity | null>;

  abstract findByStripePaymentIntentId(
    stripePaymentIntentId: string,
  ): Promise<PaymentEntity | null>;

  abstract getByUser(
    userId: string,
    options?: {
      page?: number;
      limit?: number;
      type?: PaymentEntity["type"];
      status?: PaymentEntity["status"];
      search?: string;
      from?: number;
      to?: number;
    },
  ): Promise<PaymentEntity[]>;

  abstract countByUser(
    userId: string,
    options?: {
      type?: PaymentEntity["type"];
      status?: PaymentEntity["status"];
      search?: string;
      from?: number;
      to?: number;
    },
  ): Promise<number>;

  abstract update(
    id: string,
    payment: Partial<Omit<PaymentEntity, "id">>,
  ): Promise<PaymentEntity | null>;
}
