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
    const paymentModuleAccess = AuthMiddleware.requireModules("payments");

    router.get(
      "/history",
      AuthMiddleware.requireAuth,
      paymentModuleAccess,
      paymentHistoryController.getHistory,
    );
    router.get(
      "/history/:paymentId",
      AuthMiddleware.requireAuth,
      paymentModuleAccess,
      paymentHistoryController.getPaymentDetail,
    );

    router.post(
      "/tickets/:ticketId/payment-intent",
      AuthMiddleware.requireAuth,
      paymentModuleAccess,
      controller.createPaymentIntent,
    );
    router.post(
      "/tickets/:ticketId/confirm",
      AuthMiddleware.requireAuth,
      paymentModuleAccess,
      controller.confirmPayment,
    );

    return router;
  }
}
