import { Router } from "express";
import { AUTH_ROLES } from "../../../domain/constants";
import { UsuarioMongoDatasource } from "../../../infrastructure/datasources/auth/usuario.datasource.mongo";
import { UsuarioRepositoryImpl } from "../../../infrastructure/repositories/auth/usuario.repository.impl";
import { AuthMiddleware } from "../../middlewares";
import { UsuarioService } from "../../services/auth/usuario.service";
import { UsuarioController } from "./usuario.controller";

export class UsuarioRoutes {
  static get routes(): Router {
    const router = Router();

    const datasource = new UsuarioMongoDatasource();
    const repository = new UsuarioRepositoryImpl(datasource);
    const service = new UsuarioService(repository);
    const controller = new UsuarioController(service);
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
