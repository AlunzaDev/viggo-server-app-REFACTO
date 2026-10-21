import { ExternalPaymentService } from "../services/payments/external-payment.service";
import { PostgresExternalProviderDirectory } from "../../infrastructure/external-payments/provider-directory.postgres";
import { StripeExternalGateway } from "../../infrastructure/external-payments/stripe-external.gateway";
import { ExternalOrderPostgresRepository } from "../../infrastructure/repositories/payments/external-order.repository.postgres";

export const buildExternalOrderRepository = () => new ExternalOrderPostgresRepository();

/** Providers come from the payment provider catalog: no provider is hard-coded. */
export const buildExternalPaymentService = () => new ExternalPaymentService(
  buildExternalOrderRepository(),
  new PostgresExternalProviderDirectory(),
  new StripeExternalGateway(),
);
