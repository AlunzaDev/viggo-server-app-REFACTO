import { Router } from "express";
import { PensionPassMongoDatasource } from "../../../infrastructure/datasources/pension/pension-pass.datasource.mongo";
import { PensionMongoDatasource } from "../../../infrastructure/datasources/pension/pension.datasource.mongo";
import { PensionPassRepositoryImpl } from "../../../infrastructure/repositories/pension/pension-pass.repository.impl";
import { PensionRepositoryImpl } from "../../../infrastructure/repositories/pension/pension.repository.impl";
import { PensionPassController } from "./pension-pass.controller";
import { PensionPassService } from "../../services/pension/pension-pass.service";
import { AuthMiddleware } from "../../middlewares";
import { AUTH_ROLES } from "../../../domain/constants";

export class PensionPassRoutes {
  static get routes(): Router {
    const router = Router();

    const pensionPassDatasource = new PensionPassMongoDatasource();
    const pensionDatasource = new PensionMongoDatasource();

    const pensionPassRepository = new PensionPassRepositoryImpl(
      pensionPassDatasource,
    );
    const pensionRepository = new PensionRepositoryImpl(pensionDatasource);

    const service = new PensionPassService(
      pensionPassRepository,
      pensionRepository,
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
