import { Router } from "express";
import { ModuloMongoDatasource } from "../../../infrastructure/datasources/parking/modulo.datasource.mongo";
import { ProyectoMongoDatasource } from "../../../infrastructure/datasources/parking/proyecto.datasource.mongo";
import { PensionMoveMongoDatasource } from "../../../infrastructure/datasources/pension/pension-move.datasource.mongo";
import { PensionPassMongoDatasource } from "../../../infrastructure/datasources/pension/pension-pass.datasource.mongo";
import { ModuloRepositoryImpl } from "../../../infrastructure/repositories/parking/modulo.repository.impl";
import { ProyectoRepositoryImpl } from "../../../infrastructure/repositories/parking/proyecto.repository.impl";
import { PensionMoveRepositoryImpl } from "../../../infrastructure/repositories/pension/pension-move.repository.impl";
import { PensionPassRepositoryImpl } from "../../../infrastructure/repositories/pension/pension-pass.repository.impl";
import { PensionMoveController } from "./pension-move.controller";
import { PensionMoveService } from "../../services/pension/pension-move.service";
import { AuthMiddleware } from "../../middlewares";
import { AUTH_ROLES } from "../../../domain/constants";

export class PensionMoveRoutes {
  static get routes(): Router {
    const router = Router();

    const pensionMoveDatasource = new PensionMoveMongoDatasource();
    const pensionPassDatasource = new PensionPassMongoDatasource();
    const proyectoDatasource = new ProyectoMongoDatasource();
    const moduloDatasource = new ModuloMongoDatasource();

    const pensionMoveRepository = new PensionMoveRepositoryImpl(
      pensionMoveDatasource,
    );
    const pensionPassRepository = new PensionPassRepositoryImpl(
      pensionPassDatasource,
    );
    const proyectoRepository = new ProyectoRepositoryImpl(proyectoDatasource);
    const moduloRepository = new ModuloRepositoryImpl(moduloDatasource);

    const service = new PensionMoveService(
      pensionMoveRepository,
      pensionPassRepository,
      proyectoRepository,
      moduloRepository,
    );
    const controller = new PensionMoveController(service);
    const adminRoles = AuthMiddleware.requireRoles(
      AUTH_ROLES.ADMIN,
      AUTH_ROLES.SUPER,
    );

    router.post(
      "/",
      AuthMiddleware.requireAuth,
      controller.createPensionMove,
    );
    router.get("/", controller.getPensionMoves);
    router.get(
      "/pension-pass/:pensionPassId",
      controller.getPensionMovesByPensionPass,
    );
    router.get("/proyecto/:proyectoId", controller.getPensionMovesByProyecto);
    router.get("/:id", controller.getPensionMoveById);
    router.patch(
      "/:id",
      AuthMiddleware.requireAuth,
      adminRoles,
      controller.updatePensionMove,
    );
    router.delete(
      "/:id",
      AuthMiddleware.requireAuth,
      adminRoles,
      controller.deletePensionMove,
    );
    
    return router;
  }
}
