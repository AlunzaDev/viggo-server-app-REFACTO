import { Router } from "express";
import { TicketMongoDatasource } from "../../../infrastructure/datasources/parking/ticket.datasource.mongo";
import { TicketRepositoryImpl } from "../../../infrastructure/repositories/parking/ticket.repository.impl";
import { AuthMiddleware } from "../../middlewares";
import { PaymentHistoryService } from "../../services/payments/payment-history.service";
import { TicketPaymentService } from "../../services/payments/ticket-payment.service";
import { PaymentHistoryController } from "./payment-history.controller";
import { TicketPaymentController } from "./ticket-payment.controller";

export class TicketPaymentRoutes {
  static get routes(): Router {
    const router = Router();

    const ticketDatasource = new TicketMongoDatasource();
    const ticketRepository = new TicketRepositoryImpl(ticketDatasource);
    const service = new TicketPaymentService(ticketRepository);
    const controller = new TicketPaymentController(service);
    const paymentHistoryService = new PaymentHistoryService();
    const paymentHistoryController = new PaymentHistoryController(
      paymentHistoryService,
    );

    router.get(
      "/history",
      AuthMiddleware.requireAuth,
      paymentHistoryController.getHistory,
    );
    router.get(
      "/history/:paymentId",
      AuthMiddleware.requireAuth,
      paymentHistoryController.getPaymentDetail,
    );

    router.post(
      "/tickets/:ticketId/payment-intent",
      AuthMiddleware.requireAuth,
      controller.createPaymentIntent,
    );
    router.post(
      "/tickets/:ticketId/confirm",
      AuthMiddleware.requireAuth,
      controller.confirmPayment,
    );

    return router;
  }
}
