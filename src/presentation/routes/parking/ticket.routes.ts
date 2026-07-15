import { Router } from "express";
import { buildTicketController } from "../../dependencies";
import { AuthMiddleware } from "../../middlewares";
import { AUTH_ROLES } from "../../../domain/constants";

export class TicketRoutes {
  static get routes(): Router {
    const router = Router();

    const controller = buildTicketController();
    const adminRoles = AuthMiddleware.requireRoles(
      AUTH_ROLES.ADMIN,
      AUTH_ROLES.SUPER,
    );

    router.post("/", AuthMiddleware.requireAuth, controller.createTicket);
    router.post(
      "/createTicket",
      AuthMiddleware.requireAuth,
      controller.createTicketLegacy,
    );
    router.get("/", controller.getTickets);
    router.get(
      "/usuario/:usuarioId/activo",
      controller.getActiveTicketByUsuario,
    );
    router.get(
      "/userHistoryTickets",
      AuthMiddleware.requireAuth,
      controller.getMyHistoryTickets,
    );
    router.get(
      "/currentTicket",
      AuthMiddleware.requireAuth,
      controller.getMyCurrentTicket,
    );
    router.get("/usuario/:usuarioId", controller.getTicketsByUsuario);
    router.post(
      "/payTicket",
      AuthMiddleware.requireAuth,
      controller.payTicketLegacy,
    );
    router.post(
      "/killTicket",
      AuthMiddleware.requireAuth,
      controller.killTicketLegacy,
    );
    router.get("/:id", controller.getTicketById);
    router.patch("/:id", AuthMiddleware.requireAuth, controller.updateTicket);
    router.delete(
      "/:id",
      AuthMiddleware.requireAuth,
      adminRoles,
      controller.deleteTicket,
    );

    return router;
  }
}
