import { Router } from "express";
import { OperationalIncidentController } from "./operational-incident.controller";

export class OperationalIncidentRoutes {
  static get routes(): Router {
    const router = Router();
    const controller = new OperationalIncidentController();

    router.get("/", controller.list);
    router.post("/:incidentKey/resolve", controller.resolve);

    return router;
  }
}
