import { Router } from "express";
import { HealthController } from "./health.controller";

export class HealthRoutes {
  static get routes(): Router {
    const router = Router();
    const controller = new HealthController();

    router.get("/", controller.summary);
    router.get("/db", controller.db);
    router.get("/sync", controller.sync);
    router.get("/financial-worker", controller.financialWorker);

    return router;
  }
}
