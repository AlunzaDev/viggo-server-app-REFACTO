import { Router } from "express";
import { buildSyncController } from "../../dependencies";
import { requireInstallationAuth, requireLinkTokenAuth } from "../../middlewares/sync-auth.middleware";

export class SyncRoutes {
  static get routes(): Router {
    const router = Router();
    const controller = buildSyncController();

    // Linking: authenticated with the project's link token (the project comes from the token).
    router.post("/installation-link/preview", requireLinkTokenAuth, controller.previewInstallationLink);
    router.post("/installation-requests", requireLinkTokenAuth, controller.requestInstallationLink);
    router.get("/installation-request/status", requireLinkTokenAuth, controller.getInstallationRequestStatus);

    // Operation: authenticated with the installation's own sync token, scoped to its project.
    router.use(requireInstallationAuth);
    router.get("/status", controller.status);
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
