import { Router } from "express";
import { buildLocalProjectsController } from "../../dependencies";
import { AuthMiddleware } from "../../middlewares";

export class LocalProjectsRoutes {
  static get routes(): Router {
    const router = Router();
    const controller = buildLocalProjectsController();

    router.use(
      AuthMiddleware.requireAuth,
      AuthMiddleware.requireModules("projects", "installations"),
    );
    router.get("/:projectId/snapshot", controller.getSnapshot);

    return router;
  }
}
