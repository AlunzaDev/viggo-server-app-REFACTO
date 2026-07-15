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

    router.post(
      "/",
      AuthMiddleware.requireAuth,
      adminRoles,
      controller.createPensionPass,
    );
    router.get("/", controller.getPensionPasses);
    router.get("/pension/:pensionId", controller.getPensionPassesByPension);
    router.get("/usuario/:usuarioId", controller.getPensionPassesByUsuario);
    router.get(
      "/getPensionsPassByUser",
      AuthMiddleware.requireAuth,
      controller.getMyPensionPasses,
    );
    router.post(
      "/open-barrier-with-pension-pass",
      AuthMiddleware.requireAuth,
      controller.openBarrierWithPensionPass,
    );
    router.get(
      "/pensionMovesByPensionPass/:id",
      controller.getPensionMovesByPensionPass,
    );
    router.post(
      "/precontract-pension-pass",
      AuthMiddleware.requireAuth,
      controller.precontractPensionPass,
    );
    router.patch(
      "/renew-pension-pass/:id",
      AuthMiddleware.requireAuth,
      controller.renewPensionPass,
    );
    router.patch(
      "/contract-pension-pass/:id",
      AuthMiddleware.requireAuth,
      controller.contractPensionPass,
    );
    router.get("/:id", controller.getPensionPassById);
    router.patch(
      "/:id/status",
      AuthMiddleware.requireAuth,
      adminRoles,
      controller.updatePensionPassStatus,
    );
    router.patch(
      "/:id",
      AuthMiddleware.requireAuth,
      adminRoles,
      controller.updatePensionPass,
    );
    router.delete(
      "/:id",
      AuthMiddleware.requireAuth,
      adminRoles,
      controller.deletePensionPass,
    );

    return router;
  }
}
