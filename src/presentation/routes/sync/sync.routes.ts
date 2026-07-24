import { Router } from "express";
import { requireSyncAuth } from "../../middlewares/sync-auth.middleware";
import { SyncController } from "./sync.controller";

export class SyncRoutes {
  static get routes(): Router {
    const router = Router();
    const controller = new SyncController();

    router.use(requireSyncAuth);
    router.get("/status", controller.status);
    router.get("/projects", controller.getProjectsCatalog);
    router.get("/configuration/:proyectoId", controller.getConfiguration);
    router.get("/access-snapshot/:proyectoId", controller.getAccessSnapshot);
    router.get("/access-user/by-correo/:correo", controller.getAccessUserByCorreo);
    router.get("/access-user/by-telefono/:telefono", controller.getAccessUserByTelefono);
    router.get("/installation-request/status", controller.getInstallationRequestStatus);
    router.post("/installation-requests", controller.requestInstallationLink);
    router.post("/events", controller.receiveEvent);

    return router;
  }
}
