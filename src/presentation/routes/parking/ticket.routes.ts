import { Router } from "express";
import { ModuloMongoDatasource } from "../../../infrastructure/datasources/parking/modulo.datasource.mongo";
import { ProyectoMongoDatasource } from "../../../infrastructure/datasources/parking/proyecto.datasource.mongo";
import { TicketMongoDatasource } from "../../../infrastructure/datasources/parking/ticket.datasource.mongo";
import { ModuloRepositoryImpl } from "../../../infrastructure/repositories/parking/modulo.repository.impl";
import { ProyectoRepositoryImpl } from "../../../infrastructure/repositories/parking/proyecto.repository.impl";
import { TicketRepositoryImpl } from "../../../infrastructure/repositories/parking/ticket.repository.impl";
import { TicketController } from "./ticket.controller";
import { TicketService } from "../../services/parking/ticket.service";
import { AuthMiddleware } from "../../middlewares";
import { AUTH_ROLES } from "../../../domain/constants";

export class TicketRoutes {
  static get routes(): Router {
    const router = Router();

    const ticketDatasource = new TicketMongoDatasource();
    const proyectoDatasource = new ProyectoMongoDatasource();
    const moduloDatasource = new ModuloMongoDatasource();

    const ticketRepository = new TicketRepositoryImpl(ticketDatasource);
    const proyectoRepository = new ProyectoRepositoryImpl(proyectoDatasource);
    const moduloRepository = new ModuloRepositoryImpl(moduloDatasource);

    const service = new TicketService(
      ticketRepository,
      proyectoRepository,
      moduloRepository,
    );
    const controller = new TicketController(service);
    const adminRoles = AuthMiddleware.requireRoles(
      AUTH_ROLES.ADMIN,
      AUTH_ROLES.SUPER,
    );

    router.post(
      "/",
      //AuthMiddleware.requireAuth,
      //adminRoles,
      controller.createTicket,
    );
    router.get("/", controller.getTickets);
    router.get(
      "/usuario/:usuarioId/activo",
      controller.getActiveTicketByUsuario,
    );
    router.get("/usuario/:usuarioId", controller.getTicketsByUsuario);
    router.get("/:id", controller.getTicketById);
    router.patch(
      "/:id",
      //AuthMiddleware.requireAuth,
      //adminRoles,
      controller.updateTicket,
    );
    router.delete(
      "/:id",
      AuthMiddleware.requireAuth,
      adminRoles,
      controller.deleteTicket,
    );

    return router;
  }
}
