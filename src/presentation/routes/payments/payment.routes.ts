import { Router } from "express";
import { buildPaymentHistoryController } from "../../dependencies";
import { AuthMiddleware } from "../../middlewares";

export class PaymentRoutes {
  static get routes(): Router {
    const router = Router();
    const controller = buildPaymentHistoryController();
    const paymentModuleAccess = AuthMiddleware.requireModules("payments");

    router.get("/history", AuthMiddleware.requireAuth, paymentModuleAccess, controller.getHistory);
    router.get("/history/:paymentId", AuthMiddleware.requireAuth, paymentModuleAccess, controller.getPaymentDetail);

    return router;
  }
}
