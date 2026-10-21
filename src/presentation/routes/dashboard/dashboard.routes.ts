import { Router } from "express";
import { buildDashboardController } from "../../dependencies";
import { AuthMiddleware } from "../../middlewares";

export class DashboardRoutes {
  static get routes() {
    const router = Router();
    const controller = buildDashboardController();

    router.get("/", AuthMiddleware.requireModules("payments"), controller.getMetrics);
    return router;
  }
}
