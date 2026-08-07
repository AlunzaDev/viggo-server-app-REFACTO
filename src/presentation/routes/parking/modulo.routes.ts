import { Router } from "express";
import { AUTH_ROLES } from "../../../domain/constants";
import { buildModuloController } from "../../dependencies";
import { AuthMiddleware } from "../../middlewares";

export class ModuloRoutes {
  static get routes(): Router {
    const router = Router();
    const controller = buildModuloController();
    const adminRoles = AuthMiddleware.requireRoles(AUTH_ROLES.ADMIN, AUTH_ROLES.SUPER);
    const moduleAccess = AuthMiddleware.requireModules("modules");

    router.get("/", AuthMiddleware.requireAuth, moduleAccess, controller.getModulos);
    router.get("/proyecto/:proyectoId", AuthMiddleware.requireAuth, moduleAccess, controller.getModulosByProyecto);
    router.get("/identificador/:identificador", AuthMiddleware.requireAuth, moduleAccess, controller.getModuloByIdentificador);
    router.get("/:id/submodulos", AuthMiddleware.requireAuth, moduleAccess, controller.getSubmodulos);
    router.get("/:id", AuthMiddleware.requireAuth, moduleAccess, controller.getModuloById);
    router.post("/", AuthMiddleware.requireAuth, adminRoles, moduleAccess, controller.createModulo);
    router.post("/:id/submodulos", AuthMiddleware.requireAuth, adminRoles, moduleAccess, controller.createSubmodulo);
    router.patch("/:id/status", AuthMiddleware.requireAuth, adminRoles, moduleAccess, controller.updateModuloStatus);
    router.patch("/:id/submodulos/:submoduloId", AuthMiddleware.requireAuth, adminRoles, moduleAccess, controller.updateSubmodulo);
    router.patch("/:id", AuthMiddleware.requireAuth, adminRoles, moduleAccess, controller.updateModulo);
    router.delete("/:id/submodulos/:submoduloId", AuthMiddleware.requireAuth, AuthMiddleware.requireRoles(AUTH_ROLES.SUPER), moduleAccess, controller.deleteSubmodulo);
    router.delete("/:id", AuthMiddleware.requireAuth, AuthMiddleware.requireRoles(AUTH_ROLES.SUPER), moduleAccess, controller.deleteModulo);

    return router;
  }
}
