import { Router } from "express";
import { AUTH_ROLES } from "../../../domain/constants";
import { AuthMiddleware } from "../../middlewares";
import { InstallationsController } from "./installations.controller";

export class InstallationsRoutes {
  static get routes(): Router {
    const router = Router();
    const controller = new InstallationsController();
    const adminRoles = AuthMiddleware.requireRoles(AUTH_ROLES.ADMIN, AUTH_ROLES.SUPER);
    const installationsModuleAccess = AuthMiddleware.requireModules("installations");

    router.use(AuthMiddleware.requireAuth, adminRoles, installationsModuleAccess);
    router.get("/", controller.getRequests);
    router.patch("/:id/approve", controller.approveRequest);
    router.patch("/:id/reject", controller.rejectRequest);

    return router;
  }
}
