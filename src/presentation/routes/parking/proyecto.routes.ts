import { Router } from "express";
import { buildProyectoController } from "../../dependencies";
import { AuthMiddleware } from "../../middlewares";
import { AUTH_ROLES } from "../../../domain/constants";

export class ProyectoRoutes {
  static get routes(): Router {
    const router = Router();

    const controller = buildProyectoController();
    const adminRoles = AuthMiddleware.requireRoles(
      AUTH_ROLES.ADMIN,
      AUTH_ROLES.SUPER,
    );

    router.post(
      "/",
      AuthMiddleware.requireAuth,
      adminRoles,
      controller.createProyecto,
    );
    router.get("/", controller.getProyectos);
    router.get("/:id", controller.getProyectoById);
    router.patch(
      "/:id/status",
      AuthMiddleware.requireAuth,
      adminRoles,
      controller.updateProyectoStatus,
    );
    router.patch(
      "/:id",
      AuthMiddleware.requireAuth,
      adminRoles,
      controller.updateProyecto,
    );
    router.delete(
      "/:id",
      AuthMiddleware.requireAuth,
      adminRoles,
      controller.deleteProyecto,
    );

    return router;
  }
}
