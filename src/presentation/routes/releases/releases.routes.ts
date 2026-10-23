import { Router } from "express";
import { buildReleasesController } from "../../dependencies";
import { AuthMiddleware } from "../../middlewares";

export class ReleasesRoutes {
  static get routes(): Router {
    const router = Router();
    const controller = buildReleasesController();

    // What every parking runs is decided by super administrators only.
    router.use(AuthMiddleware.requireRoles("SUPER_ROLE"));
    router.get("/", controller.catalog);
    router.get("/estado", controller.status);
    router.post("/paquetes", controller.addPackage);
    router.put("/canales/:component", controller.setChannel);

    return router;
  }
}
