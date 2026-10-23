import { Router } from "express";
import { buildConnectionHistoryController, buildHeartbeatOverviewController } from "../../dependencies";
import { AuthMiddleware } from "../../middlewares";

export class HeartbeatOverviewRoutes {
  static get routes(): Router {
    const router = Router();
    const controller = buildHeartbeatOverviewController();
    const history = buildConnectionHistoryController();

    // Same access as one parking's heartbeat (/api/local-projects/:id/heartbeat).
    router.use(AuthMiddleware.requireModules("projects", "installations"));
    router.get("/", controller.get);
    router.get("/historial", history.list);
    router.get("/historial/resumen", history.downtime);

    return router;
  }
}
