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
    const projectModuleAccess = AuthMiddleware.requireModules("projects");

    router.post(
      "/",
      AuthMiddleware.requireAuth,
      adminRoles,
      projectModuleAccess,
      controller.createProyecto,
    );
    router.get("/", controller.getProyectos);
    router.get("/:id", controller.getProyectoById);
    router.patch(
      "/:id/status",
      AuthMiddleware.requireAuth,
      adminRoles,
      projectModuleAccess,
      controller.updateProyectoStatus,
    );
    router.patch(
      "/:id",
      AuthMiddleware.requireAuth,
      adminRoles,
      projectModuleAccess,
      controller.updateProyecto,
    );
    router.delete(
      "/:id",
      AuthMiddleware.requireAuth,
      adminRoles,
      projectModuleAccess,
      controller.deleteProyecto,
    );

    return router;
  }
}
