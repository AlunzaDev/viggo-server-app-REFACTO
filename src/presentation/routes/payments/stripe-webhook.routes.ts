import { Router } from "express";
import { StripeWebhookController } from "./stripe-webhook.controller";

export class StripeWebhookRoutes {
  static get routes() {
    const router = Router();
    const controller = new StripeWebhookController();
    router.post("/", controller.handle);
    return router;
  }
}
