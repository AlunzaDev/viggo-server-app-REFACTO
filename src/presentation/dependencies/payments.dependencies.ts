import { PaymentMongoDatasource } from "../../infrastructure/datasources/payments/payment.datasource.mongo";
import { PaymentRepositoryImpl } from "../../infrastructure/repositories/payments/payment.repository.impl";
import { PaymentHistoryController } from "../routes/payments/payment-history.controller";
import { StripePaymentController } from "../routes/payments/stripe-payment.controller";
import { PaymentHistoryService } from "../services/payments/payment-history.service";
import { StripePaymentService } from "../services/payments/stripe-payment.service";

export const buildStripePaymentController = (): StripePaymentController =>
  new StripePaymentController(new StripePaymentService());

export const buildPaymentHistoryController = (): PaymentHistoryController => {
  const repository = new PaymentRepositoryImpl(new PaymentMongoDatasource());
  return new PaymentHistoryController(new PaymentHistoryService(repository));
};
