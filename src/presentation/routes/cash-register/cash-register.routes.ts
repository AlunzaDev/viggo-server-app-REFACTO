import { Router } from "express";
import { buildCashRegisterController } from "../../dependencies";
import { AuthMiddleware } from "../../middlewares";

export class CashRegisterRoutes {
  static get routes(): Router {
    const router = Router();
    const controller = buildCashRegisterController();
    const moduleAccess = AuthMiddleware.requireModules("cashPayments", "payments");

    router.post(
      "/shifts/open",
      AuthMiddleware.requireAuth,
      moduleAccess,
      controller.openShift,
    );

    router.get(
      "/shifts/active/:moduloId",
      AuthMiddleware.requireAuth,
      moduleAccess,
      controller.getActiveShiftByModulo,
    );

    router.get(
      "/shifts",
      AuthMiddleware.requireAuth,
      moduleAccess,
      controller.listShifts,
    );

    router.get(
      "/shifts/:shiftId",
      AuthMiddleware.requireAuth,
      moduleAccess,
      controller.getShiftDetail,
    );

    router.post(
      "/shifts/:shiftId/movements",
      AuthMiddleware.requireAuth,
      moduleAccess,
      controller.registerMovement,
    );

    router.post(
      "/shifts/:shiftId/counts",
      AuthMiddleware.requireAuth,
      moduleAccess,
      controller.saveCount,
    );

    router.get(
      "/shifts/:shiftId/cut-preview",
      AuthMiddleware.requireAuth,
      moduleAccess,
      controller.getCutPreview,
    );

    router.post(
      "/shifts/:shiftId/close",
      AuthMiddleware.requireAuth,
      moduleAccess,
      controller.closeShift,
    );

    return router;
  }
}
