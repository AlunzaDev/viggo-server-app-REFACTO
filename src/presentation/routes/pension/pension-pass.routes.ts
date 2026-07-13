import { Router } from "express";
import { PensionPassMongoDatasource } from "../../../infrastructure/datasources/pension/pension-pass.datasource.mongo";
import { PensionMongoDatasource } from "../../../infrastructure/datasources/pension/pension.datasource.mongo";
import { ProyectoMongoDatasource } from "../../../infrastructure/datasources/parking/proyecto.datasource.mongo";
import { ModuloMongoDatasource } from "../../../infrastructure/datasources/parking/modulo.datasource.mongo";
import { PensionMoveMongoDatasource } from "../../../infrastructure/datasources/pension/pension-move.datasource.mongo";
import { PensionPassRepositoryImpl } from "../../../infrastructure/repositories/pension/pension-pass.repository.impl";
import { PensionRepositoryImpl } from "../../../infrastructure/repositories/pension/pension.repository.impl";
import { ProyectoRepositoryImpl } from "../../../infrastructure/repositories/parking/proyecto.repository.impl";
import { ModuloRepositoryImpl } from "../../../infrastructure/repositories/parking/modulo.repository.impl";
import { PensionMoveRepositoryImpl } from "../../../infrastructure/repositories/pension/pension-move.repository.impl";
import { PensionPassController } from "./pension-pass.controller";
import { PensionPassService } from "../../services/pension/pension-pass.service";
import { AuthMiddleware } from "../../middlewares";
import { AUTH_ROLES } from "../../../domain/constants";

export class PensionPassRoutes {
  static get routes(): Router {
    const router = Router();

    const pensionPassDatasource = new PensionPassMongoDatasource();
    const pensionDatasource = new PensionMongoDatasource();
    const proyectoDatasource = new ProyectoMongoDatasource();
    const moduloDatasource = new ModuloMongoDatasource();
    const pensionMoveDatasource = new PensionMoveMongoDatasource();

    const pensionPassRepository = new PensionPassRepositoryImpl(
      pensionPassDatasource,
    );
    const pensionRepository = new PensionRepositoryImpl(pensionDatasource);
    const proyectoRepository = new ProyectoRepositoryImpl(proyectoDatasource);
    const moduloRepository = new ModuloRepositoryImpl(moduloDatasource);
    const pensionMoveRepository = new PensionMoveRepositoryImpl(
      pensionMoveDatasource,
    );

    const service = new PensionPassService(
      pensionPassRepository,
      pensionRepository,
      proyectoRepository,
      moduloRepository,
      pensionMoveRepository,
    );
    const controller = new PensionPassController(service);
    const adminRoles = AuthMiddleware.requireRoles(
      AUTH_ROLES.ADMIN,
      AUTH_ROLES.SUPER,
    );

    router.post(
      "/",
      AuthMiddleware.requireAuth,
      adminRoles,
      controller.createPensionPass,
    );
    router.get("/", controller.getPensionPasses);
    router.get("/pension/:pensionId", controller.getPensionPassesByPension);
    router.get("/usuario/:usuarioId", controller.getPensionPassesByUsuario);
    router.get(
      "/getPensionsPassByUser",
      AuthMiddleware.requireAuth,
      controller.getMyPensionPasses,
    );
    router.post(
      "/open-barrier-with-pension-pass",
      AuthMiddleware.requireAuth,
      controller.openBarrierWithPensionPass,
    );
    router.get(
      "/pensionMovesByPensionPass/:id",
      controller.getPensionMovesByPensionPass,
    );
    router.post(
      "/precontract-pension-pass",
      AuthMiddleware.requireAuth,
      controller.precontractPensionPass,
    );
    router.patch(
      "/renew-pension-pass/:id",
      AuthMiddleware.requireAuth,
      controller.renewPensionPass,
    );
    router.patch(
      "/contract-pension-pass/:id",
      AuthMiddleware.requireAuth,
      controller.contractPensionPass,
    );
    router.get("/:id", controller.getPensionPassById);
    router.patch(
      "/:id/status",
      AuthMiddleware.requireAuth,
      adminRoles,
      controller.updatePensionPassStatus,
    );
    router.patch(
      "/:id",
      AuthMiddleware.requireAuth,
      adminRoles,
      controller.updatePensionPass,
    );
    router.delete(
      "/:id",
      AuthMiddleware.requireAuth,
      adminRoles,
      controller.deletePensionPass,
    );

    return router;
  }
}
