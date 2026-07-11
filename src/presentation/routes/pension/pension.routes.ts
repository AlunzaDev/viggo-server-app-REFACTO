import { Router } from "express";
import { ProyectoMongoDatasource } from "../../../infrastructure/datasources/parking/proyecto.datasource.mongo";
import { PensionMongoDatasource } from "../../../infrastructure/datasources/pension/pension.datasource.mongo";
import { ProyectoRepositoryImpl } from "../../../infrastructure/repositories/parking/proyecto.repository.impl";
import { PensionRepositoryImpl } from "../../../infrastructure/repositories/pension/pension.repository.impl";
import { PensionController } from "./pension.controller";
import { PensionService } from "../../services/pension/pension.service";
import { AuthMiddleware } from "../../middlewares";
import { AUTH_ROLES } from "../../../domain/constants";

export class PensionRoutes {
  static get routes(): Router {
    const router = Router();

    const pensionDatasource = new PensionMongoDatasource();
    const proyectoDatasource = new ProyectoMongoDatasource();

    const pensionRepository = new PensionRepositoryImpl(pensionDatasource);
    const proyectoRepository = new ProyectoRepositoryImpl(proyectoDatasource);

    const service = new PensionService(pensionRepository, proyectoRepository);
    const controller = new PensionController(service);
    const adminRoles = AuthMiddleware.requireRoles(
      AUTH_ROLES.ADMIN,
      AUTH_ROLES.SUPER,
    );

    router.post(
      "/",
      AuthMiddleware.requireAuth,
      adminRoles,
      controller.createPension,
    );
    router.get("/", controller.getPensiones);
    router.get("/proyecto/:proyectoId", controller.getPensionesByProyecto);
    router.get("/:id", controller.getPensionById);
    router.patch(
      "/:id/status",
      AuthMiddleware.requireAuth,
      adminRoles,
      controller.updatePensionStatus,
    );
    router.patch(
      "/:id",
      AuthMiddleware.requireAuth,
      adminRoles,
      controller.updatePension,
    );
    router.delete(
      "/:id",
      AuthMiddleware.requireAuth,
      adminRoles,
      controller.deletePension,
    );

    return router;
  }
}
