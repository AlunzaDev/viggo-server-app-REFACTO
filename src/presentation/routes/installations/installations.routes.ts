import { Router } from "express";
import { AUTH_ROLES } from "../../../domain/constants";
import { buildInstallationsController } from "../../dependencies";
import { AuthMiddleware } from "../../middlewares";

export class InstallationsRoutes {
  static get routes(): Router {
    const router = Router();
    const controller = buildInstallationsController();
    const adminRoles = AuthMiddleware.requireRoles(AUTH_ROLES.ADMIN, AUTH_ROLES.SUPER);
    const installationsModuleAccess = AuthMiddleware.requireModules("installations");

    router.use(AuthMiddleware.requireAuth, adminRoles, installationsModuleAccess);
    router.get("/", controller.getRequests);
    router.patch("/:id/approve", controller.approveRequest);
    router.patch("/:id/reject", controller.rejectRequest);
    router.patch("/:id/unlink-temporary", controller.unlinkTemporary);
    router.patch("/:id/unlink-permanent", controller.unlinkPermanent);

    return router;
  }
}
