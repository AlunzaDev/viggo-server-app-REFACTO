import { Router } from "express";
import { buildPushController } from "../../dependencies";
import { AuthMiddleware } from "../../middlewares";

export class PushRoutes {
  static get routes(): Router {
    const router = Router();
    const controller = buildPushController();

    // The notices are about installations: same access as the heartbeat screens.
    router.use(AuthMiddleware.requireModules("projects", "installations"));
    router.get("/config", controller.config);
    router.post("/suscripciones", controller.subscribe);
    router.delete("/suscripciones", controller.unsubscribe);
    router.get("/preferencias", controller.preferences);
    router.put("/preferencias/:proyectoId", controller.setPreference);

    return router;
  }
}
