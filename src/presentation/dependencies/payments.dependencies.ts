import { PaymentHistoryController } from "../routes/payments/payment-history.controller";
import { StripePaymentController } from "../routes/payments/stripe-payment.controller";
import { StripeWebhookController } from "../routes/payments/stripe-webhook.controller";
import { FinancialReconciliationService } from "../services/payments/financial-reconciliation.service";
import { PaymentHistoryService } from "../services/payments/payment-history.service";
import { StripePaymentService } from "../services/payments/stripe-payment.service";
import { StripePaymentMongoDatasource } from "../../infrastructure/datasources/payments/stripe-payment.datasource.mongo";
import { StripePaymentRepositoryImpl } from "../../infrastructure/repositories/payments/stripe-payment.repository.impl";
import { buildPensionPassService } from "./pension.dependencies";
import {
  buildJobLockRepository,
  buildMobileOperationRepository,
  buildPaymentRepository,
  buildPensionPassRepository,
  buildPensionRepository,
} from "./repositories.dependencies";

export const buildStripePaymentController = (): StripePaymentController => {
  const repository = new StripePaymentRepositoryImpl(
    new StripePaymentMongoDatasource(),
  );
  return new StripePaymentController(
    new StripePaymentService(
      repository,
      buildPaymentRepository(),
      buildPensionPassRepository(),
      buildPensionRepository(),
    ),
  );
};

export const buildPaymentHistoryController = (): PaymentHistoryController => {
  return new PaymentHistoryController(new PaymentHistoryService(buildPaymentRepository()));
};

export const buildStripeWebhookController = (): StripeWebhookController =>
  new StripeWebhookController(buildPaymentRepository(), buildMobileOperationRepository());

export const buildFinancialReconciliationService = (): FinancialReconciliationService =>
  new FinancialReconciliationService(
    buildPaymentRepository(),
    buildMobileOperationRepository(),
    buildPensionPassRepository(),
    buildPensionRepository(),
    buildPensionPassService(),
    buildJobLockRepository(),
  );
