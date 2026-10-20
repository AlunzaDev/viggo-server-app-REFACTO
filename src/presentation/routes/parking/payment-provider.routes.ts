import { Router } from "express";
import { AUTH_ROLES } from "../../../domain/constants";
import { buildPaymentProviderController } from "../../dependencies/parking.dependencies";
import { AuthMiddleware } from "../../middlewares";
import { uploadProviderLogo } from "../../middlewares/provider-logo-upload.middleware";
import { rateLimitMiddleware } from "../../middlewares/rate-limit.middleware";

const providerTestLimiter = rateLimitMiddleware({ windowMs: 60_000, maxRequests: 20, message: "Demasiadas pruebas de conexion; espera un minuto" });

export class PaymentProviderRoutes {
  static get routes() {
    const router = Router(); const controller = buildPaymentProviderController();
    const admins = AuthMiddleware.requireRoles(AUTH_ROLES.ADMIN, AUTH_ROLES.SUPER);
    router.get("/", AuthMiddleware.requireAuth, controller.getAll);
    router.post("/", AuthMiddleware.requireAuth, admins, uploadProviderLogo, controller.create);
    router.patch("/:id", AuthMiddleware.requireAuth, admins, uploadProviderLogo, controller.update);
    // Calls the provider's API: limited so the catalog cannot be used to hammer a third party.
    router.post("/:id/test", AuthMiddleware.requireAuth, admins, providerTestLimiter, controller.testConnection);
    router.delete("/:id", AuthMiddleware.requireAuth, AuthMiddleware.requireRoles(AUTH_ROLES.SUPER), controller.delete);
    return router;
  }
}
