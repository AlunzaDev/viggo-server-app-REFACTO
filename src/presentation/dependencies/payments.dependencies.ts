import { TicketMongoDatasource } from "../../infrastructure/datasources/parking/ticket.datasource.mongo";
import { TicketRepositoryImpl } from "../../infrastructure/repositories/parking/ticket.repository.impl";
import { PaymentHistoryController } from "../routes/payments/payment-history.controller";
import { StripePaymentController } from "../routes/payments/stripe-payment.controller";
import { TicketPaymentController } from "../routes/payments/ticket-payment.controller";
import { PaymentHistoryService } from "../services/payments/payment-history.service";
import { StripePaymentService } from "../services/payments/stripe-payment.service";
import { TicketPaymentService } from "../services/payments/ticket-payment.service";
import { PaymentMongoDatasource } from "../../infrastructure/datasources/payments/payment.datasource.mongo";
import { PaymentRepositoryImpl } from "../../infrastructure/repositories/payments/payment.repository.impl";
import { CashPaymentSessionMongoDatasource } from "../../infrastructure/datasources/payments/cash-payment-session.datasource.mongo";
import { CashRegisterCountMongoDatasource } from "../../infrastructure/datasources/cash-register/cash-register-count.datasource.mongo";
import { CashRegisterCutMongoDatasource } from "../../infrastructure/datasources/cash-register/cash-register-cut.datasource.mongo";
import { CashRegisterMovementMongoDatasource } from "../../infrastructure/datasources/cash-register/cash-register-movement.datasource.mongo";
import { CashRegisterShiftMongoDatasource } from "../../infrastructure/datasources/cash-register/cash-register-shift.datasource.mongo";
import { CashPaymentSessionRepositoryImpl } from "../../infrastructure/repositories/payments/cash-payment-session.repository.impl";
import { CashRegisterCountRepositoryImpl } from "../../infrastructure/repositories/cash-register/cash-register-count.repository.impl";
import { CashRegisterCutRepositoryImpl } from "../../infrastructure/repositories/cash-register/cash-register-cut.repository.impl";
import { CashRegisterMovementRepositoryImpl } from "../../infrastructure/repositories/cash-register/cash-register-movement.repository.impl";
import { CashRegisterShiftRepositoryImpl } from "../../infrastructure/repositories/cash-register/cash-register-shift.repository.impl";
import { CashTicketPaymentController } from "../routes/payments/cash-ticket-payment.controller";
import { CashRegisterService } from "../services/cash-register/cash-register.service";
import { CashTicketPaymentService } from "../services/payments/cash-ticket-payment.service";

export const buildStripePaymentController = (): StripePaymentController => {
  const service = new StripePaymentService();

  return new StripePaymentController(service);
};

export const buildTicketPaymentController = (): TicketPaymentController => {
  const ticketRepository = new TicketRepositoryImpl(
    new TicketMongoDatasource(),
  );
  const paymentRepository = new PaymentRepositoryImpl(
    new PaymentMongoDatasource(),
  );
  const service = new TicketPaymentService(ticketRepository, paymentRepository);

  return new TicketPaymentController(service);
};

export const buildPaymentHistoryController = (): PaymentHistoryController => {
  const paymentRepository = new PaymentRepositoryImpl(
    new PaymentMongoDatasource(),
  );
  const service = new PaymentHistoryService(paymentRepository);

  return new PaymentHistoryController(service);
};

export const buildCashTicketPaymentController =
  (): CashTicketPaymentController => {
    const ticketRepository = new TicketRepositoryImpl(
      new TicketMongoDatasource(),
    );
    const paymentRepository = new PaymentRepositoryImpl(
      new PaymentMongoDatasource(),
    );
    const cashPaymentSessionRepository = new CashPaymentSessionRepositoryImpl(
      new CashPaymentSessionMongoDatasource(),
    );
    const cashRegisterShiftRepository = new CashRegisterShiftRepositoryImpl(
      new CashRegisterShiftMongoDatasource(),
    );
    const cashRegisterMovementRepository = new CashRegisterMovementRepositoryImpl(
      new CashRegisterMovementMongoDatasource(),
    );
    const cashRegisterCountRepository = new CashRegisterCountRepositoryImpl(
      new CashRegisterCountMongoDatasource(),
    );
    const cashRegisterCutRepository = new CashRegisterCutRepositoryImpl(
      new CashRegisterCutMongoDatasource(),
    );
    const cashRegisterService = new CashRegisterService(
      cashRegisterShiftRepository,
      cashRegisterMovementRepository,
      cashRegisterCountRepository,
      cashRegisterCutRepository,
    );

    const service = new CashTicketPaymentService(
      ticketRepository,
      cashPaymentSessionRepository,
      paymentRepository,
      cashRegisterShiftRepository,
      cashRegisterService,
    );

    return new CashTicketPaymentController(service);
  };
