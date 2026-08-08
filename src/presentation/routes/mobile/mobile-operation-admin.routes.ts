import { Router } from "express";
import { MobileOperationAdminController } from "./mobile-operation-admin.controller";

export class MobileOperationAdminRoutes {
  static get routes(): Router {
    const router = Router();
    const controller = new MobileOperationAdminController();

    router.get("/", controller.list);
    router.post("/:operationId/reactivate", controller.reactivate);

    return router;
  }
}
