import { Router } from "express";
import { buildSyncController } from "../../dependencies";
import { failedAuthLimiter, rateLimitMiddleware } from "../../middlewares/rate-limit.middleware";
import { requireInstallationAuth, requireLinkTokenAuth } from "../../middlewares/sync-auth.middleware";

export class SyncRoutes {
  static get routes(): Router {
    const router = Router();
    const controller = buildSyncController();

    // Linking: authenticated with the project's link token (the project comes from the token).
    // These routes are public, so guessing tokens is limited per address across all three;
    // an installation polling its status with a valid token is never counted.
    const linkTokenGuesses = failedAuthLimiter({
      windowMs: 15 * 60 * 1000,
      maxFailures: 10,
      message: "Demasiados tokens de vinculacion invalidos. Intenta de nuevo mas tarde.",
    });
    // A valid token still cannot flood the approval queue with requests.
    const linkRequests = rateLimitMiddleware({ windowMs: 60 * 60 * 1000, maxRequests: 30 });
    router.post("/installation-link/preview", linkTokenGuesses, requireLinkTokenAuth, controller.previewInstallationLink);
    router.post("/installation-requests", linkTokenGuesses, linkRequests, requireLinkTokenAuth, controller.requestInstallationLink);
    router.get("/installation-request/status", linkTokenGuesses, requireLinkTokenAuth, controller.getInstallationRequestStatus);

    // Operation: authenticated with the installation's own sync token, scoped to its project.
    router.use(requireInstallationAuth);
    router.get("/status", controller.status);
    router.post("/sync-token/rotate", controller.rotateSyncToken);
    router.get("/mobile-commands/next", controller.claimNextMobileCommand);
    router.post("/mobile-commands/:operationId/complete", controller.completeMobileCommand);
    router.get("/configuration/:proyectoId", controller.getConfiguration);
    router.get("/access-snapshot/:proyectoId", controller.getAccessSnapshot);
    router.get("/access-user/by-correo/:correo", controller.getAccessUserByCorreo);
    router.get("/access-user/by-telefono/:telefono", controller.getAccessUserByTelefono);
    router.post("/heartbeat-snapshot", controller.receiveHeartbeatSnapshot);
    router.post("/events", controller.receiveEvent);

    return router;
  }
}
