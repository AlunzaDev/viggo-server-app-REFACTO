import { Router } from "express";
import { buildStripePaymentController } from "../../dependencies";
import { AuthMiddleware } from "../../middlewares";

export class StripePaymentRoutes {
  static get routes(): Router {
    const router = Router();
    const controller = buildStripePaymentController();
    const paymentModuleAccess = AuthMiddleware.requireModules("payments");

    router.post(
      "/payment-intents",
      AuthMiddleware.requireAuth,
      paymentModuleAccess,
      controller.createPaymentIntent,
    );

    return router;
  }
}
