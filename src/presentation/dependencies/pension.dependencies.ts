import { ModuloMongoDatasource } from "../../infrastructure/datasources/parking/modulo.datasource.mongo";
import { ProyectoMongoDatasource } from "../../infrastructure/datasources/parking/proyecto.datasource.mongo";
import { PensionMoveMongoDatasource } from "../../infrastructure/datasources/pension/pension-move.datasource.mongo";
import { PensionPassMongoDatasource } from "../../infrastructure/datasources/pension/pension-pass.datasource.mongo";
import { PensionMongoDatasource } from "../../infrastructure/datasources/pension/pension.datasource.mongo";
import { ModuloRepositoryImpl } from "../../infrastructure/repositories/parking/modulo.repository.impl";
import { ProyectoRepositoryImpl } from "../../infrastructure/repositories/parking/proyecto.repository.impl";
import { PensionMoveRepositoryImpl } from "../../infrastructure/repositories/pension/pension-move.repository.impl";
import { PensionPassRepositoryImpl } from "../../infrastructure/repositories/pension/pension-pass.repository.impl";
import { PensionRepositoryImpl } from "../../infrastructure/repositories/pension/pension.repository.impl";
import { PensionMoveController } from "../routes/pension/pension-move.controller";
import { PensionPassController } from "../routes/pension/pension-pass.controller";
import { PensionController } from "../routes/pension/pension.controller";
import { PensionMoveService } from "../services/pension/pension-move.service";
import { PensionPassService } from "../services/pension/pension-pass.service";
import { PensionService } from "../services/pension/pension.service";

const buildModuloRepository = () =>
  new ModuloRepositoryImpl(new ModuloMongoDatasource());

const buildProyectoRepository = () =>
  new ProyectoRepositoryImpl(new ProyectoMongoDatasource());

const buildPensionRepository = () =>
  new PensionRepositoryImpl(new PensionMongoDatasource());

const buildPensionPassRepository = () =>
  new PensionPassRepositoryImpl(new PensionPassMongoDatasource());

const buildPensionMoveRepository = () =>
  new PensionMoveRepositoryImpl(new PensionMoveMongoDatasource());

export const buildPensionController = (): PensionController => {
  const service = new PensionService(
    buildPensionRepository(),
    buildProyectoRepository(),
  );

  return new PensionController(service);
};

export const buildPensionPassController = (): PensionPassController => {
  const service = new PensionPassService(
    buildPensionPassRepository(),
    buildPensionRepository(),
    buildProyectoRepository(),
    buildModuloRepository(),
    buildPensionMoveRepository(),
  );

  return new PensionPassController(service);
};

export const buildPensionMoveController = (): PensionMoveController => {
  const service = new PensionMoveService(
    buildPensionMoveRepository(),
    buildPensionPassRepository(),
    buildProyectoRepository(),
    buildModuloRepository(),
  );

  return new PensionMoveController(service);
};
