import { ProyectoMongoDatasource } from "../../infrastructure/datasources/parking/proyecto.datasource.mongo";
import { PensionPassMongoDatasource } from "../../infrastructure/datasources/pension/pension-pass.datasource.mongo";
import { PensionMongoDatasource } from "../../infrastructure/datasources/pension/pension.datasource.mongo";
import { ProyectoRepositoryImpl } from "../../infrastructure/repositories/parking/proyecto.repository.impl";
import { PensionPassRepositoryImpl } from "../../infrastructure/repositories/pension/pension-pass.repository.impl";
import { PensionRepositoryImpl } from "../../infrastructure/repositories/pension/pension.repository.impl";
import { PensionPassController } from "../routes/pension/pension-pass.controller";
import { PensionController } from "../routes/pension/pension.controller";
import { PensionPassService } from "../services/pension/pension-pass.service";
import { PensionService } from "../services/pension/pension.service";

const buildProyectoRepository = () =>
  new ProyectoRepositoryImpl(new ProyectoMongoDatasource());
const buildPensionRepository = () =>
  new PensionRepositoryImpl(new PensionMongoDatasource());
const buildPensionPassRepository = () =>
  new PensionPassRepositoryImpl(new PensionPassMongoDatasource());

export const buildPensionController = (): PensionController =>
  new PensionController(
    new PensionService(buildPensionRepository(), buildProyectoRepository()),
  );

export const buildPensionPassController = (): PensionPassController =>
  new PensionPassController(
    new PensionPassService(buildPensionPassRepository(), buildPensionRepository()),
  );
