import { Router } from "express";
import {
  buildMobileOperationController,
  buildPensionPassController,
  buildStripePaymentController,
} from "../../dependencies";

export class MobileOperationRoutes {
  static get routes() {
    const router = Router();
    const controller = buildMobileOperationController();
    const pensionController = buildPensionPassController();
    const stripeController = buildStripePaymentController();
    router.post("/tickets", controller.createTicket);
    router.get("/tickets/current", controller.getCurrentTicket);
    router.get("/tickets/history", controller.getTicketHistory);
    router.post("/tickets/exit", controller.exitTicket);
    router.post("/tickets/:ticketId/payment-intent", controller.createTicketPaymentIntent);
    router.post("/tickets/:ticketId/confirm", controller.confirmTicketPayment);
    router.get("/operations/:operationId", controller.getOperation);
    router.get("/payments/history", controller.getPaymentHistory);
    router.get("/payments/history/:paymentId", controller.getPaymentHistoryDetail);
    router.get("/pension-pass/me", pensionController.getMyPensionPasses);
    router.post("/pension-pass/precontract", pensionController.precontractPensionPass);
    router.patch("/pension-pass/:id/renew", pensionController.renewPensionPass);
    router.patch("/pension-pass/:id/contract", pensionController.contractPensionPass);
    router.get("/pension-pass/:id", pensionController.getMyPensionPassById);
    router.post("/stripe/payment-intents", stripeController.createPaymentIntent);
    return router;
  }
}
