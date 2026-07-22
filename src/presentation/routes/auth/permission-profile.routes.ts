import { Router } from "express";
import { AUTH_ROLES } from "../../../domain/constants";
import { buildPermissionProfileController } from "../../dependencies";
import { AuthMiddleware } from "../../middlewares";

export class PermissionProfileRoutes {
  static get routes(): Router {
    const router = Router();
    const controller = buildPermissionProfileController();
    const adminRoles = AuthMiddleware.requireRoles(
      AUTH_ROLES.ADMIN,
      AUTH_ROLES.SUPER,
    );
    const permissionModuleAccess = AuthMiddleware.requireModules(
      "permissionProfiles",
    );

    router.use(AuthMiddleware.requireAuth, adminRoles, permissionModuleAccess);

    router.post("/", controller.createProfile);
    router.get("/", controller.getProfiles);
    router.get("/:id", controller.getProfileById);
    router.patch("/:id", controller.updateProfile);
    router.delete("/:id", controller.deleteProfile);

    return router;
  }
}
