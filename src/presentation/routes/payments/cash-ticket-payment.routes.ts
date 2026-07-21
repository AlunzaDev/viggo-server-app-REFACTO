import { Router } from "express";
import { buildCashTicketPaymentController } from "../../dependencies";
import { AuthMiddleware } from "../../middlewares";

export class CashTicketPaymentRoutes {
  static get routes(): Router {
    const router = Router();
    const controller = buildCashTicketPaymentController();
    const cashModuleAccess = AuthMiddleware.requireModules(
      "cashPayments",
      "payments",
    );

    router.post(
      "/tickets/resolve-qr",
      AuthMiddleware.requireAuth,
      cashModuleAccess,
      controller.resolveTicketFromQr,
    );

    router.post(
      "/tickets/:ticketId/start",
      AuthMiddleware.requireAuth,
      cashModuleAccess,
      controller.startCashSession,
    );

    router.post(
      "/sessions/:sessionId/insert-cash",
      AuthMiddleware.requireAuth,
      cashModuleAccess,
      controller.registerCashInsertion,
    );

    router.post(
      "/sessions/:sessionId/cancel",
      AuthMiddleware.requireAuth,
      cashModuleAccess,
      controller.cancelSession,
    );

    router.get(
      "/sessions/:sessionId",
      AuthMiddleware.requireAuth,
      cashModuleAccess,
      controller.getSessionById,
    );

    return router;
  }
}
