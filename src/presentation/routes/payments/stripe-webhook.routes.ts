import { Router } from "express";
import { buildStripeWebhookController } from "../../dependencies";

export class StripeWebhookRoutes {
  static get routes() {
    const router = Router();
    const controller = buildStripeWebhookController();
    router.post("/", controller.handle);
    return router;
  }
}
