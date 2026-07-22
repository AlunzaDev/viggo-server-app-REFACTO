import { Router } from "express";
import { buildCashTicketPaymentController } from "../../dependencies";
import { AuthMiddleware } from "../../middlewares";

export class CashTicketPaymentRoutes {
  static get routes(): Router {
    const router = Router();
    const controller = buildCashTicketPaymentController();
    const posModuleAccess = AuthMiddleware.requireModules(
      "cashPayments",
      "payments",
    );

    router.post(
      "/tickets/resolve-qr",
      AuthMiddleware.requireAuth,
      posModuleAccess,
      controller.resolveTicketFromQr,
    );

    router.post(
      "/tickets/:ticketId/start",
      AuthMiddleware.requireAuth,
      posModuleAccess,
      controller.startCashSession,
    );

    router.post(
      "/sessions/:sessionId/register-pos-amount",
      AuthMiddleware.requireAuth,
      posModuleAccess,
      controller.registerCashInsertion,
    );

    router.post(
      "/sessions/:sessionId/insert-cash",
      AuthMiddleware.requireAuth,
      posModuleAccess,
      controller.registerCashInsertion,
    );

    router.post(
      "/sessions/:sessionId/cancel",
      AuthMiddleware.requireAuth,
      posModuleAccess,
      controller.cancelSession,
    );

    router.get(
      "/sessions/:sessionId",
      AuthMiddleware.requireAuth,
      posModuleAccess,
      controller.getSessionById,
    );

    return router;
  }
}
