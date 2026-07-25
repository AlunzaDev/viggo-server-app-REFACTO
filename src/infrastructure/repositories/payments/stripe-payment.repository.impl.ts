import type { StripePaymentDatasource } from "../../../domain/datasources/payments/stripe-payment.datasource";
import { StripePaymentRepository } from "../../../domain/repository/payments/stripe-payment.repository";

export class StripePaymentRepositoryImpl implements StripePaymentRepository {
  constructor(private readonly datasource: StripePaymentDatasource) {}

  findUserById(usuarioId: string) {
    return this.datasource.findUserById(usuarioId);
  }
}
