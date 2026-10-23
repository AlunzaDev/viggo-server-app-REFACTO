import { Router } from "express";
import { buildOccupancyOverviewController } from "../../dependencies";
import { AuthMiddleware } from "../../middlewares";

export class OccupancyOverviewRoutes {
  static get routes(): Router {
    const router = Router();
    const controller = buildOccupancyOverviewController();

    // Same access as the heartbeat of every parking.
    router.use(AuthMiddleware.requireModules("projects", "installations"));
    router.get("/", controller.list);
    router.get("/:proyectoId/hoy", controller.today);

    return router;
  }
}
