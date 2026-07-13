import { Router } from "express";
import { AuthMiddleware } from "../../middlewares";
import { StripePaymentService } from "../../services/payments/stripe-payment.service";
import { StripePaymentController } from "./stripe-payment.controller";

export class StripePaymentRoutes {
  static get routes(): Router {
    const router = Router();

    const service = new StripePaymentService();
    const controller = new StripePaymentController(service);

    router.get(
      "/getPaymentIntent",
      AuthMiddleware.requireAuth,
      controller.createPaymentIntent,
    );

    return router;
  }
}
