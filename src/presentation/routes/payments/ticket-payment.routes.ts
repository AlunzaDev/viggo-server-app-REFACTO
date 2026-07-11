import { Router } from "express";
import { TicketMongoDatasource } from "../../../infrastructure/datasources/parking/ticket.datasource.mongo";
import { TicketRepositoryImpl } from "../../../infrastructure/repositories/parking/ticket.repository.impl";
import { AuthMiddleware } from "../../middlewares";
import { TicketPaymentService } from "../../services/payments/ticket-payment.service";
import { TicketPaymentController } from "./ticket-payment.controller";

export class TicketPaymentRoutes {
  static get routes(): Router {
    const router = Router();

    const ticketDatasource = new TicketMongoDatasource();
    const ticketRepository = new TicketRepositoryImpl(ticketDatasource);
    const service = new TicketPaymentService(ticketRepository);
    const controller = new TicketPaymentController(service);

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
