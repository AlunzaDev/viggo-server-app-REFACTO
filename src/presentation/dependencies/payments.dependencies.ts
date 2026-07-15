import { TicketMongoDatasource } from "../../infrastructure/datasources/parking/ticket.datasource.mongo";
import { TicketRepositoryImpl } from "../../infrastructure/repositories/parking/ticket.repository.impl";
import { PaymentHistoryController } from "../routes/payments/payment-history.controller";
import { StripePaymentController } from "../routes/payments/stripe-payment.controller";
import { TicketPaymentController } from "../routes/payments/ticket-payment.controller";
import { PaymentHistoryService } from "../services/payments/payment-history.service";
import { StripePaymentService } from "../services/payments/stripe-payment.service";
import { TicketPaymentService } from "../services/payments/ticket-payment.service";

export const buildStripePaymentController = (): StripePaymentController => {
  const service = new StripePaymentService();

  return new StripePaymentController(service);
};

export const buildTicketPaymentController = (): TicketPaymentController => {
  const ticketRepository = new TicketRepositoryImpl(new TicketMongoDatasource());
  const service = new TicketPaymentService(ticketRepository);

  return new TicketPaymentController(service);
};

export const buildPaymentHistoryController = (): PaymentHistoryController => {
  const service = new PaymentHistoryService();

  return new PaymentHistoryController(service);
};
