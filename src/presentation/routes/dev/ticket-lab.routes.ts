import { Router } from "express";
import { buildTicketLabController } from "../../dependencies";

/** Development-only laboratory (mounted when PROD=false); see TicketLabService. */
export class TicketLabRoutes {
  static get routes(): Router {
    const router = Router();
    const controller = buildTicketLabController();

    router.get("/", controller.page);
    router.get("/context", controller.context);
    router.post("/detect", controller.detect);
    router.get("/payments/:userId", controller.payments);
    router.post("/module-token", controller.moduleToken);
    router.post("/tickets", controller.createTicket);
    return router;
  }
}
