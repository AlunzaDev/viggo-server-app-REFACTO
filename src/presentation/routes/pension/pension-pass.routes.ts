import { Router } from "express";
import { buildPensionPassController } from "../../dependencies";
import { AuthMiddleware } from "../../middlewares";
import { AUTH_ROLES } from "../../../domain/constants";

export class PensionPassRoutes {
  static get routes(): Router {
    const router = Router();

    const controller = buildPensionPassController();
    const adminRoles = AuthMiddleware.requireRoles(
      AUTH_ROLES.ADMIN,
      AUTH_ROLES.SUPER,
    );
    const pensionPassModuleAccess =
      AuthMiddleware.requireModules("pensionPasses");

    router.post(
      "/",
      AuthMiddleware.requireAuth,
      adminRoles,
      pensionPassModuleAccess,
      controller.createPensionPass,
    );
    router.get("/", AuthMiddleware.requireAuth, controller.getPensionPasses);
    router.get(
      "/pension/:pensionId",
      AuthMiddleware.requireAuth,
      controller.getPensionPassesByPension,
    );
    router.get(
      "/usuario/:usuarioId",
      AuthMiddleware.requireAuth,
      controller.getPensionPassesByUsuario,
    );
    router.get(
      "/getPensionsPassByUser",
      AuthMiddleware.requireAuth,
      pensionPassModuleAccess,
      controller.getMyPensionPasses,
    );
    router.post(
      "/open-barrier-with-pension-pass",
      AuthMiddleware.requireAuth,
      pensionPassModuleAccess,
      controller.openBarrierWithPensionPass,
    );
    router.get(
      "/pensionMovesByPensionPass/:id",
      AuthMiddleware.requireAuth,
      controller.getPensionMovesByPensionPass,
    );
    router.post(
      "/precontract-pension-pass",
      AuthMiddleware.requireAuth,
      pensionPassModuleAccess,
      controller.precontractPensionPass,
    );
    router.patch(
      "/renew-pension-pass/:id",
      AuthMiddleware.requireAuth,
      pensionPassModuleAccess,
      controller.renewPensionPass,
    );
    router.patch(
      "/contract-pension-pass/:id",
      AuthMiddleware.requireAuth,
      pensionPassModuleAccess,
      controller.contractPensionPass,
    );
    router.get("/:id", AuthMiddleware.requireAuth, controller.getPensionPassById);
    router.patch(
      "/:id/status",
      AuthMiddleware.requireAuth,
      adminRoles,
      pensionPassModuleAccess,
      controller.updatePensionPassStatus,
    );
    router.patch(
      "/:id",
      AuthMiddleware.requireAuth,
      adminRoles,
      pensionPassModuleAccess,
      controller.updatePensionPass,
    );
    router.delete(
      "/:id",
      AuthMiddleware.requireAuth,
      adminRoles,
      pensionPassModuleAccess,
      controller.deletePensionPass,
    );

    return router;
  }
}
