import {
  NewPaymentRecord,
  PaymentDatasource,
  PaymentReconciliationUpdate,
  PaymentRecord,
  PaymentRecordLookup,
} from "../../../domain/datasources/payments/payment.datasource";
import { PaymentEntity } from "../../../domain/entities/payments/payment.entity";
import { PaymentRepository } from "../../../domain/repositories/payments/payment.repository";

export class PaymentRepositoryImpl extends PaymentRepository {
  constructor(private readonly paymentDatasource: PaymentDatasource) {
    super();
  }

  findRecordByIdempotencyKey(idempotencyKey: string): Promise<PaymentRecord | null> {
    return this.paymentDatasource.findRecordByIdempotencyKey(idempotencyKey);
  }

  findRecordByStripePaymentIntentId(stripePaymentIntentId: string): Promise<PaymentRecord | null> {
    return this.paymentDatasource.findRecordByStripePaymentIntentId(stripePaymentIntentId);
  }

  findRecordForUser(lookup: PaymentRecordLookup): Promise<PaymentRecord | null> {
    return this.paymentDatasource.findRecordForUser(lookup);
  }

  createRecord(payment: NewPaymentRecord): Promise<PaymentRecord> {
    return this.paymentDatasource.createRecord(payment);
  }

  markSucceeded(
    id: string,
    update: { rawProviderStatus: string; paidAt: number },
  ): Promise<PaymentRecord | null> {
    return this.paymentDatasource.markSucceeded(id, update);
  }

  claimForOperation(id: string, operationKey: string, appliedAt: number): Promise<PaymentRecord | null> {
    return this.paymentDatasource.claimForOperation(id, operationKey, appliedAt);
  }

  updateReconciliation(id: string, update: PaymentReconciliationUpdate): Promise<void> {
    return this.paymentDatasource.updateReconciliation(id, update);
  }

  findPendingReconciliation(limit: number): Promise<PaymentRecord[]> {
    return this.paymentDatasource.findPendingReconciliation(limit);
  }

  getSerializedByUser(
    userId: string,
    options: { page: number; limit: number; from?: number; to?: number },
  ): Promise<{ total: number; payments: Record<string, unknown>[] }> {
    return this.paymentDatasource.getSerializedByUser(userId, options);
  }

  findSerializedByIdForUser(id: string, userId: string): Promise<Record<string, unknown> | null> {
    return this.paymentDatasource.findSerializedByIdForUser(id, userId);
  }

  create(payment: Omit<PaymentEntity, "id">): Promise<PaymentEntity> {
    return this.paymentDatasource.create(payment);
  }

  findById(id: string): Promise<PaymentEntity | null> {
    return this.paymentDatasource.findById(id);
  }

  findByStripePaymentIntentId(
    stripePaymentIntentId: string,
  ): Promise<PaymentEntity | null> {
    return this.paymentDatasource.findByStripePaymentIntentId(
      stripePaymentIntentId,
    );
  }

  getByUser(
    userId: string,
    options?: {
      page?: number;
      limit?: number;
      type?: PaymentEntity["type"];
      status?: PaymentEntity["status"];
      from?: number;
      to?: number;
    },
  ): Promise<PaymentEntity[]> {
    return this.paymentDatasource.getByUser(userId, options);
  }

  countByUser(
    userId: string,
    options?: {
      type?: PaymentEntity["type"];
      status?: PaymentEntity["status"];
      from?: number;
      to?: number;
    },
  ): Promise<number> {
    return this.paymentDatasource.countByUser(userId, options);
  }

  update(
    id: string,
    payment: Partial<Omit<PaymentEntity, "id">>,
  ): Promise<PaymentEntity | null> {
    return this.paymentDatasource.update(id, payment);
  }
}
