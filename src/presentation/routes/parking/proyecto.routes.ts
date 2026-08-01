import { Router } from "express";
import { buildProyectoController } from "../../dependencies";
import { AuthMiddleware } from "../../middlewares";
import { AUTH_ROLES } from "../../../domain/constants";
import { uploadProjectImage } from "../../middlewares/project-image-upload.middleware";

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
      uploadProjectImage,
      controller.createProyecto,
    );
    router.get("/", AuthMiddleware.requireAuth, controller.getProyectos);
    router.get("/:id", AuthMiddleware.requireAuth, controller.getProyectoById);
    router.get(
      "/:id/installation-link-token",
      AuthMiddleware.requireAuth,
      adminRoles,
      projectModuleAccess,
      controller.getInstallationLinkToken,
    );
    router.post(
      "/:id/installation-link-token",
      AuthMiddleware.requireAuth,
      adminRoles,
      projectModuleAccess,
      controller.regenerateInstallationLinkToken,
    );
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
      uploadProjectImage,
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
