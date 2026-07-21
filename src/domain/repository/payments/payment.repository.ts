import { PaymentEntity } from "../../entities/payments/payment.entity";

export abstract class PaymentRepository {
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
      from?: number;
      to?: number;
    },
  ): Promise<PaymentEntity[]>;

  abstract countByUser(
    userId: string,
    options?: {
      type?: PaymentEntity["type"];
      status?: PaymentEntity["status"];
      from?: number;
      to?: number;
    },
  ): Promise<number>;

  abstract update(
    id: string,
    payment: Partial<Omit<PaymentEntity, "id">>,
  ): Promise<PaymentEntity | null>;
}
