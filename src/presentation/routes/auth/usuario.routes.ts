import { Router } from "express";
import { AUTH_ROLES } from "../../../domain/constants";
import { buildUsuarioController } from "../../dependencies";
import { AuthMiddleware } from "../../middlewares";
import { uploadUserImage } from "../../middlewares/user-image-upload.middleware";

export class UsuarioRoutes {
  static get routes(): Router {
    const router = Router();

    const controller = buildUsuarioController();
    const adminRoles = AuthMiddleware.requireRoles(
      AUTH_ROLES.ADMIN,
      AUTH_ROLES.SUPER,
    );
    const userModuleAccess = AuthMiddleware.requireModules("users");

    router.use(AuthMiddleware.requireAuth, adminRoles, userModuleAccess);

    router.post("/", AuthMiddleware.protectSuperUser, uploadUserImage, controller.createUsuario);
    router.get("/", controller.getUsuarios);
    router.get("/:id", controller.getUsuarioById);
    router.patch("/:id/status", AuthMiddleware.protectSuperUser, controller.updateUsuarioStatus);
    router.patch("/:id", AuthMiddleware.protectSuperUser, uploadUserImage, controller.updateUsuario);
    router.delete("/:id", AuthMiddleware.requireRoles(AUTH_ROLES.SUPER), controller.deleteUsuario);

    return router;
  }
}
