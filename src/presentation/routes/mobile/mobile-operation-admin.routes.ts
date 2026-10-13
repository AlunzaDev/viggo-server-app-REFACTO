import { Router } from "express";
import { buildMobileOperationAdminController } from "../../dependencies";

export class MobileOperationAdminRoutes {
  static get routes(): Router {
    const router = Router();
    const controller = buildMobileOperationAdminController();

    router.get("/", controller.list);
    router.post("/:operationId/reactivate", controller.reactivate);

    return router;
  }
}
