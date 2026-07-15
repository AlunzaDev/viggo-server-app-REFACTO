import { Router } from "express";
import { buildStripePaymentController } from "../../dependencies";
import { AuthMiddleware } from "../../middlewares";

export class StripePaymentRoutes {
  static get routes(): Router {
    const router = Router();

    const controller = buildStripePaymentController();

    router.get(
      "/getPaymentIntent",
      AuthMiddleware.requireAuth,
      controller.createPaymentIntent,
    );

    return router;
  }
}
