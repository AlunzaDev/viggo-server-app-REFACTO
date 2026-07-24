import { Router } from "express";
import { AuthMiddleware } from "../../middlewares";
import { LocalProjectsController } from "./local-projects.controller";

export class LocalProjectsRoutes {
  static get routes(): Router {
    const router = Router();
    const controller = new LocalProjectsController();

    router.use(
      AuthMiddleware.requireAuth,
      AuthMiddleware.requireModules("projects", "installations"),
    );
    router.get("/:projectId/snapshot", controller.getSnapshot);

    return router;
  }
}
