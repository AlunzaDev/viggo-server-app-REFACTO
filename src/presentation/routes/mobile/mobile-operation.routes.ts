import { Router } from "express";
import {
  buildMobileOperationController,
  buildProyectoController,
  buildPensionController,
  buildPensionPassController,
  buildStripePaymentController,
} from "../../dependencies";

export class MobileOperationRoutes {
  static get routes() {
    const router = Router();
    const controller = buildMobileOperationController();
    const pensionController = buildPensionPassController();
    const stripeController = buildStripePaymentController();
    const projects = buildProyectoController();
    const pensions = buildPensionController();
    // All authenticated mobile users need active polygons to determine their current parking.
    router.get("/proyectos", projects.getMobileParkingAreas);
    router.get("/proyectos/:id", projects.getProyectoById);
    router.get("/pensiones/proyecto/:proyectoId", pensions.getPensionesByProyecto);
    router.get("/pensiones/:id", pensions.getPensionById);
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
    router.post("/pension-pass/:id/access", controller.accessWithPensionPass);
    router.get("/pension-pass/:id/movements", pensionController.getMyPensionPassMovements);
    router.post("/stripe/payment-intents", stripeController.createPaymentIntent);
    return router;
  }
}
