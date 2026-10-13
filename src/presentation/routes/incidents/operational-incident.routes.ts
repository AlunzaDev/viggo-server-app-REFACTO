import { Router } from "express";
import { buildOperationalIncidentController } from "../../dependencies";

export class OperationalIncidentRoutes {
  static get routes(): Router {
    const router = Router();
    const controller = buildOperationalIncidentController();

    router.get("/", controller.list);
    router.post("/:incidentKey/resolve", controller.resolve);

    return router;
  }
}
