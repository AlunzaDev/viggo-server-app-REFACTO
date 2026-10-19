import { Router } from "express";
import { AUTH_ROLES } from "../../../domain/constants";
import { buildPaymentProviderController } from "../../dependencies/parking.dependencies";
import { AuthMiddleware } from "../../middlewares";
import { uploadProviderLogo } from "../../middlewares/provider-logo-upload.middleware";

export class PaymentProviderRoutes {
  static get routes() {
    const router = Router(); const controller = buildPaymentProviderController();
    const admins = AuthMiddleware.requireRoles(AUTH_ROLES.ADMIN, AUTH_ROLES.SUPER);
    router.get("/", AuthMiddleware.requireAuth, controller.getAll);
    router.post("/", AuthMiddleware.requireAuth, admins, uploadProviderLogo, controller.create);
    router.patch("/:id", AuthMiddleware.requireAuth, admins, uploadProviderLogo, controller.update);
    router.delete("/:id", AuthMiddleware.requireAuth, AuthMiddleware.requireRoles(AUTH_ROLES.SUPER), controller.delete);
    return router;
  }
}
