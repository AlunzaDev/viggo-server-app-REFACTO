import { Router } from "express";
import { AUTH_ROLES } from "../../../domain/constants";
import { buildUsuarioController } from "../../dependencies";
import { AuthMiddleware } from "../../middlewares";

export class UsuarioRoutes {
  static get routes(): Router {
    const router = Router();

    const controller = buildUsuarioController();
    const adminRoles = AuthMiddleware.requireRoles(
      AUTH_ROLES.ADMIN,
      AUTH_ROLES.SUPER,
    );

    router.use(AuthMiddleware.requireAuth, adminRoles);

    router.post("/", controller.createUsuario);
    router.get("/", controller.getUsuarios);
    router.get("/:id", controller.getUsuarioById);
    router.patch("/:id/status", controller.updateUsuarioStatus);
    router.patch("/:id", controller.updateUsuario);
    router.delete("/:id", controller.deleteUsuario);

    return router;
  }
}
