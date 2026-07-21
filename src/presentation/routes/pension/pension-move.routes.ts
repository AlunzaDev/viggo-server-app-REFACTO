import { Router } from "express";
import { buildPensionMoveController } from "../../dependencies";
import { AuthMiddleware } from "../../middlewares";
import { AUTH_ROLES } from "../../../domain/constants";

export class PensionMoveRoutes {
  static get routes(): Router {
    const router = Router();

    const controller = buildPensionMoveController();
    const adminRoles = AuthMiddleware.requireRoles(
      AUTH_ROLES.ADMIN,
      AUTH_ROLES.SUPER,
    );
    const pensionMoveModuleAccess =
      AuthMiddleware.requireModules("pensionMoves");

    router.post(
      "/",
      AuthMiddleware.requireAuth,
      pensionMoveModuleAccess,
      controller.createPensionMove,
    );
    router.get("/", AuthMiddleware.requireAuth, controller.getPensionMoves);
    router.get(
      "/pension-pass/:pensionPassId",
      AuthMiddleware.requireAuth,
      controller.getPensionMovesByPensionPass,
    );
    router.get(
      "/proyecto/:proyectoId",
      AuthMiddleware.requireAuth,
      controller.getPensionMovesByProyecto,
    );
    router.get("/:id", AuthMiddleware.requireAuth, controller.getPensionMoveById);
    router.patch(
      "/:id",
      AuthMiddleware.requireAuth,
      adminRoles,
      pensionMoveModuleAccess,
      controller.updatePensionMove,
    );
    router.delete(
      "/:id",
      AuthMiddleware.requireAuth,
      adminRoles,
      pensionMoveModuleAccess,
      controller.deletePensionMove,
    );

    return router;
  }
}
