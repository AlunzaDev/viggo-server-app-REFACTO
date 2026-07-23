import { Router } from "express";
import { AUTH_ROLES } from "../../../domain/constants";
import { buildPensionPassController } from "../../dependencies";
import { AuthMiddleware } from "../../middlewares";

export class PensionPassRoutes {
  static get routes(): Router {
    const router = Router();
    const controller = buildPensionPassController();
    const adminRoles = AuthMiddleware.requireRoles(AUTH_ROLES.ADMIN, AUTH_ROLES.SUPER);
    const access = AuthMiddleware.requireModules("pensionPasses");

    router.get("/", AuthMiddleware.requireAuth, controller.getPensionPasses);
    router.get("/me", AuthMiddleware.requireAuth, access, controller.getMyPensionPasses);
    router.get("/pension/:pensionId", AuthMiddleware.requireAuth, controller.getPensionPassesByPension);
    router.get("/usuario/:usuarioId", AuthMiddleware.requireAuth, adminRoles, access, controller.getPensionPassesByUsuario);
    router.post("/precontract", AuthMiddleware.requireAuth, access, controller.precontractPensionPass);
    router.patch("/:id/renew", AuthMiddleware.requireAuth, access, controller.renewPensionPass);
    router.patch("/:id/contract", AuthMiddleware.requireAuth, access, controller.contractPensionPass);
    router.get("/:id", AuthMiddleware.requireAuth, controller.getPensionPassById);
    router.post("/", AuthMiddleware.requireAuth, adminRoles, access, controller.createPensionPass);
    router.patch("/:id/status", AuthMiddleware.requireAuth, adminRoles, access, controller.updatePensionPassStatus);
    router.patch("/:id", AuthMiddleware.requireAuth, adminRoles, access, controller.updatePensionPass);
    router.delete("/:id", AuthMiddleware.requireAuth, adminRoles, access, controller.deletePensionPass);

    return router;
  }
}
