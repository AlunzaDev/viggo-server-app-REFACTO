import { PaymentHistoryController } from "../routes/payments/payment-history.controller";
import { StripePaymentController } from "../routes/payments/stripe-payment.controller";
import { StripeWebhookController } from "../routes/payments/stripe-webhook.controller";
import { FinancialReconciliationService } from "../services/payments/financial-reconciliation.service";
import { PaymentHistoryService } from "../services/payments/payment-history.service";
import { StripePaymentService } from "../services/payments/stripe-payment.service";
import { buildPensionPassService } from "./pension.dependencies";
import {
  buildJobLockRepository,
  buildMobileOperationRepository,
  buildPaymentRepository,
  buildPensionPassRepository,
  buildPensionRepository,
  buildStripePaymentRepository,
} from "./repositories.dependencies";

export const buildStripePaymentController = (): StripePaymentController => {
  const repository = buildStripePaymentRepository();
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
