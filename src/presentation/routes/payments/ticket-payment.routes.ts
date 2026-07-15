import { Router } from "express";
import {
  buildPaymentHistoryController,
  buildTicketPaymentController,
} from "../../dependencies";
import { AuthMiddleware } from "../../middlewares";

export class TicketPaymentRoutes {
  static get routes(): Router {
    const router = Router();

    const controller = buildTicketPaymentController();
    const paymentHistoryController = buildPaymentHistoryController();

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
