import { Router } from "express";
import { ModuloMongoDatasource } from "../../../infrastructure/datasources/parking/modulo.datasource.mongo";
import { ProyectoMongoDatasource } from "../../../infrastructure/datasources/parking/proyecto.datasource.mongo";
import { ModuloRepositoryImpl } from "../../../infrastructure/repositories/parking/modulo.repository.impl";
import { ProyectoRepositoryImpl } from "../../../infrastructure/repositories/parking/proyecto.repository.impl";
import { ModuloController } from "./modulo.controller";
import { ModuloService } from "../../services/parking/modulo.service";
import { AuthMiddleware } from "../../middlewares";
import { AUTH_ROLES } from "../../../domain/constants";

export class ModuloRoutes {
  static get routes(): Router {
    const router = Router();

    const moduloDatasource = new ModuloMongoDatasource();
    const proyectoDatasource = new ProyectoMongoDatasource();

    const moduloRepository = new ModuloRepositoryImpl(moduloDatasource);
    const proyectoRepository = new ProyectoRepositoryImpl(proyectoDatasource);

    const service = new ModuloService(moduloRepository, proyectoRepository);
    const controller = new ModuloController(service);
    const adminRoles = AuthMiddleware.requireRoles(
      AUTH_ROLES.ADMIN,
      AUTH_ROLES.SUPER,
    );

    router.post(
      "/",
      AuthMiddleware.requireAuth,
      adminRoles,
      controller.createModulo,
    );
    router.get("/", controller.getModulos);
    router.get("/proyecto/:proyectoId", controller.getModulosByProyecto);
    router.get(
      "/identificador/:identificador",
      controller.getModuloByIdentificador,
    );
    router.get("/:id", controller.getModuloById);
    router.patch(
      "/:id/status",
      AuthMiddleware.requireAuth,
      adminRoles,
      controller.updateModuloStatus,
    );
    router.patch(
      "/:id",
      AuthMiddleware.requireAuth,
      adminRoles,
      controller.updateModulo,
    );
    router.delete(
      "/:id",
      AuthMiddleware.requireAuth,
      adminRoles,
      controller.deleteModulo,
    );

    return router;
  }
}
