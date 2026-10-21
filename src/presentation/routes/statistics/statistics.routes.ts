import { Router } from "express";
import { buildStatisticsController } from "../../dependencies";
import { AuthMiddleware } from "../../middlewares";

export class StatisticsRoutes {
  static get routes() {
    const router = Router();
    const controller = buildStatisticsController();
    const payments = AuthMiddleware.requireModules("payments");

    router.get("/catalogo", controller.catalog);
    router.get("/", payments, controller.query);
    router.get("/exportar", payments, controller.export);
    return router;
  }
}
