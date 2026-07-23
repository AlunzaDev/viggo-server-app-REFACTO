import { Router } from "express";
import { requireSyncAuth } from "../../middlewares/sync-auth.middleware";
import { SyncController } from "./sync.controller";

export class SyncRoutes {
  static get routes(): Router {
    const router = Router();
    const controller = new SyncController();

    router.use(requireSyncAuth);
    router.get("/status", controller.status);
    router.get("/configuration/:proyectoId", controller.getConfiguration);
    router.post("/events", controller.receiveEvent);

    return router;
  }
}
