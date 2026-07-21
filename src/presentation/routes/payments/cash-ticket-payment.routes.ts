import { Router } from "express";
import { buildCashTicketPaymentController } from "../../dependencies";
import { AuthMiddleware } from "../../middlewares";

export class CashTicketPaymentRoutes {
  static get routes(): Router {
    const router = Router();
    const controller = buildCashTicketPaymentController();

    router.post(
      "/tickets/resolve-qr",
      AuthMiddleware.requireAuth,
      controller.resolveTicketFromQr,
    );

    router.post(
      "/tickets/:ticketId/start",
      AuthMiddleware.requireAuth,
      controller.startCashSession,
    );

    router.post(
      "/sessions/:sessionId/insert-cash",
      AuthMiddleware.requireAuth,
      controller.registerCashInsertion,
    );

    router.post(
      "/sessions/:sessionId/cancel",
      AuthMiddleware.requireAuth,
      controller.cancelSession,
    );

    router.get(
      "/sessions/:sessionId",
      AuthMiddleware.requireAuth,
      controller.getSessionById,
    );

    return router;
  }
}
