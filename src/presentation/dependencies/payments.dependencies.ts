import { PaymentMongoDatasource } from "../../infrastructure/datasources/payments/payment.datasource.mongo";
import { PaymentRepositoryImpl } from "../../infrastructure/repositories/payments/payment.repository.impl";
import { PaymentHistoryController } from "../routes/payments/payment-history.controller";
import { StripePaymentController } from "../routes/payments/stripe-payment.controller";
import { PaymentHistoryService } from "../services/payments/payment-history.service";
import { StripePaymentService } from "../services/payments/stripe-payment.service";
import { StripePaymentMongoDatasource } from "../../infrastructure/datasources/payments/stripe-payment.datasource.mongo";
import { StripePaymentRepositoryImpl } from "../../infrastructure/repositories/payments/stripe-payment.repository.impl";

export const buildStripePaymentController = (): StripePaymentController => {
  const repository = new StripePaymentRepositoryImpl(
    new StripePaymentMongoDatasource(),
  );
  return new StripePaymentController(new StripePaymentService(repository));
};

export const buildPaymentHistoryController = (): PaymentHistoryController => {
  const repository = new PaymentRepositoryImpl(new PaymentMongoDatasource());
  return new PaymentHistoryController(new PaymentHistoryService(repository));
};
