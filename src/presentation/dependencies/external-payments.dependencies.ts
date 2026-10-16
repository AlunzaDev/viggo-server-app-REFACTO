import { ExternalPaymentService } from "../../domain/external-payments/external-payment.service";
import { SeguripassClient } from "../../infrastructure/external-payments/seguripass.client";
import { StripeExternalGateway } from "../../infrastructure/external-payments/stripe-external.gateway";
import { ExternalOrderPostgresRepository } from "../../infrastructure/repositories/payments/external-order.repository.postgres";

export const buildExternalPaymentService = () => new ExternalPaymentService(
  new ExternalOrderPostgresRepository(),
  // Intentionally unconfigured until #18 supplies the actual QR/API/auth contract.
  [new SeguripassClient()], new StripeExternalGateway(),
);
