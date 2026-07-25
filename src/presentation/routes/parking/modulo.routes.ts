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

    router.get("/", AuthMiddleware.requireAuth, controller.getModulos);
    router.get("/proyecto/:proyectoId", AuthMiddleware.requireAuth, controller.getModulosByProyecto);
    router.get("/identificador/:identificador", AuthMiddleware.requireAuth, controller.getModuloByIdentificador);
    router.get("/:id/submodulos", AuthMiddleware.requireAuth, controller.getSubmodulos);
    router.get("/:id", AuthMiddleware.requireAuth, controller.getModuloById);
    router.post("/", AuthMiddleware.requireAuth, adminRoles, moduleAccess, controller.createModulo);
    router.post("/:id/submodulos", AuthMiddleware.requireAuth, adminRoles, moduleAccess, controller.createSubmodulo);
    router.patch("/:id/status", AuthMiddleware.requireAuth, adminRoles, moduleAccess, controller.updateModuloStatus);
    router.patch("/:id/submodulos/:submoduloId", AuthMiddleware.requireAuth, adminRoles, moduleAccess, controller.updateSubmodulo);
    router.patch("/:id", AuthMiddleware.requireAuth, adminRoles, moduleAccess, controller.updateModulo);
    router.delete("/:id/submodulos/:submoduloId", AuthMiddleware.requireAuth, adminRoles, moduleAccess, controller.deleteSubmodulo);
    router.delete("/:id", AuthMiddleware.requireAuth, adminRoles, moduleAccess, controller.deleteModulo);

    return router;
  }
}
