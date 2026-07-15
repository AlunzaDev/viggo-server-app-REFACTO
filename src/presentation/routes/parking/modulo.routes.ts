import { Router } from "express";
import { buildModuloController } from "../../dependencies";
import { AuthMiddleware } from "../../middlewares";
import { AUTH_ROLES } from "../../../domain/constants";

export class ModuloRoutes {
  static get routes(): Router {
    const router = Router();

    const controller = buildModuloController();
    const adminRoles = AuthMiddleware.requireRoles(
      AUTH_ROLES.ADMIN,
      AUTH_ROLES.SUPER,
    );

    router.post(
      "/",
      AuthMiddleware.requireAuth,
      adminRoles,
      controller.createModulo,
    );
    router.get("/", controller.getModulos);
    router.get("/proyecto/:proyectoId", controller.getModulosByProyecto);
    router.get(
      "/identificador/:identificador",
      controller.getModuloByIdentificador,
    );
    router.get("/:id", controller.getModuloById);
    router.patch(
      "/:id/status",
      AuthMiddleware.requireAuth,
      adminRoles,
      controller.updateModuloStatus,
    );
    router.patch(
      "/:id",
      AuthMiddleware.requireAuth,
      adminRoles,
      controller.updateModulo,
    );
    router.delete(
      "/:id",
      AuthMiddleware.requireAuth,
      adminRoles,
      controller.deleteModulo,
    );

    return router;
  }
}
