import { Router } from "express";
import { ProyectoMongoDatasource } from "../../../infrastructure/datasources/parking/proyecto.datasource.mongo";
import { ProyectoRepositoryImpl } from "../../../infrastructure/repositories/parking/proyecto.repository.impl";
import { ProyectoController } from "./proyecto.controller";
import { ProyectoService } from "../../services/parking/proyecto.service";
import { AuthMiddleware } from "../../middlewares";
import { AUTH_ROLES } from "../../../domain/constants";

export class ProyectoRoutes {
  static get routes(): Router {
    const router = Router();

    const datasource = new ProyectoMongoDatasource();
    const repository = new ProyectoRepositoryImpl(datasource);
    const service = new ProyectoService(repository);
    const controller = new ProyectoController(service);
    const adminRoles = AuthMiddleware.requireRoles(
      AUTH_ROLES.ADMIN,
      AUTH_ROLES.SUPER,
    );

    router.post(
      "/",
      AuthMiddleware.requireAuth,
      adminRoles,
      controller.createProyecto,
    );
    router.get("/", controller.getProyectos);
    router.get("/:id", controller.getProyectoById);
    router.patch(
      "/:id/status",
      AuthMiddleware.requireAuth,
      adminRoles,
      controller.updateProyectoStatus,
    );
    router.patch(
      "/:id",
      AuthMiddleware.requireAuth,
      adminRoles,
      controller.updateProyecto,
    );
    router.delete(
      "/:id",
      AuthMiddleware.requireAuth,
      adminRoles,
      controller.deleteProyecto,
    );
    
    return router;
  }
}
