import { Router } from "express";
import { buildPensionController } from "../../dependencies";
import { AuthMiddleware } from "../../middlewares";
import { AUTH_ROLES } from "../../../domain/constants";

export class PensionRoutes {
  static get routes(): Router {
    const router = Router();

    const controller = buildPensionController();
    const adminRoles = AuthMiddleware.requireRoles(
      AUTH_ROLES.ADMIN,
      AUTH_ROLES.SUPER,
    );
    const pensionModuleAccess = AuthMiddleware.requireModules("pensions");

    router.post(
      "/",
      AuthMiddleware.requireAuth,
      adminRoles,
      pensionModuleAccess,
      controller.createPension,
    );
    router.get("/", controller.getPensiones);
    router.get("/proyecto/:proyectoId", controller.getPensionesByProyecto);
    router.get("/:id", controller.getPensionById);
    router.patch(
      "/:id/status",
      AuthMiddleware.requireAuth,
      adminRoles,
      pensionModuleAccess,
      controller.updatePensionStatus,
    );
    router.patch(
      "/:id",
      AuthMiddleware.requireAuth,
      adminRoles,
      pensionModuleAccess,
      controller.updatePension,
    );
    router.delete(
      "/:id",
      AuthMiddleware.requireAuth,
      adminRoles,
      pensionModuleAccess,
      controller.deletePension,
    );

    return router;
  }
}
