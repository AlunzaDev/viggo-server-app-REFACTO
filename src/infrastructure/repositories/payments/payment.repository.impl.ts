import { PaymentDatasource } from "../../../domain/datasources/payments/payment.datasource";
import { PaymentEntity } from "../../../domain/entities/payments/payment.entity";
import { PaymentRepository } from "../../../domain/repository/payments/payment.repository";

export class PaymentRepositoryImpl extends PaymentRepository {
  constructor(private readonly paymentDatasource: PaymentDatasource) {
    super();
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
