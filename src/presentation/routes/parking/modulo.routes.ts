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
    const moduleAccess = AuthMiddleware.requireModules("modules");

    router.post(
      "/",
      AuthMiddleware.requireAuth,
      adminRoles,
      moduleAccess,
      controller.createModulo,
    );
    router.get(
      "/pending-device-bindings",
      AuthMiddleware.requireAuth,
      adminRoles,
      moduleAccess,
      controller.getModulosWithPendingDeviceBindingRequests,
    );
    router.get("/", AuthMiddleware.requireAuth, controller.getModulos);
    router.get(
      "/proyecto/:proyectoId",
      AuthMiddleware.requireAuth,
      controller.getModulosByProyecto,
    );
    router.get(
      "/identificador/:identificador",
      AuthMiddleware.requireAuth,
      controller.getModuloByIdentificador,
    );
    router.get("/:id", AuthMiddleware.requireAuth, controller.getModuloById);
    router.patch(
      "/:id/status",
      AuthMiddleware.requireAuth,
      adminRoles,
      moduleAccess,
      controller.updateModuloStatus,
    );
    router.patch(
      "/:id/device-binding/reset",
      AuthMiddleware.requireAuth,
      adminRoles,
      moduleAccess,
      controller.resetDeviceBinding,
    );
    router.patch(
      "/:id/device-binding/approve",
      AuthMiddleware.requireAuth,
      adminRoles,
      moduleAccess,
      controller.approveDeviceBindingRequest,
    );
    router.patch(
      "/:id/device-binding/reject",
      AuthMiddleware.requireAuth,
      adminRoles,
      moduleAccess,
      controller.rejectDeviceBindingRequest,
    );
    router.patch(
      "/:id/device-binding/pending",
      AuthMiddleware.requireAuth,
      adminRoles,
      moduleAccess,
      controller.reopenDeviceBindingRequest,
    );
    router.patch(
      "/:id",
      AuthMiddleware.requireAuth,
      adminRoles,
      moduleAccess,
      controller.updateModulo,
    );
    router.delete(
      "/:id",
      AuthMiddleware.requireAuth,
      adminRoles,
      moduleAccess,
      controller.deleteModulo,
    );

    return router;
  }
}
