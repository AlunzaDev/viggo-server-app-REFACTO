import { ModuloMongoDatasource } from "../../infrastructure/datasources/parking/modulo.datasource.mongo";
import { ProyectoMongoDatasource } from "../../infrastructure/datasources/parking/proyecto.datasource.mongo";
import { ModuloRepositoryImpl } from "../../infrastructure/repositories/parking/modulo.repository.impl";
import { ProyectoRepositoryImpl } from "../../infrastructure/repositories/parking/proyecto.repository.impl";
import { ModuloController } from "../routes/parking/modulo.controller";
import { ProyectoController } from "../routes/parking/proyecto.controller";
import { ModuloCrudService } from "../services/parking/modulo-crud.service";
import { ProyectoService } from "../services/parking/proyecto.service";

const buildModuloRepository = () =>
  new ModuloRepositoryImpl(new ModuloMongoDatasource());

const buildProyectoRepository = () =>
  new ProyectoRepositoryImpl(new ProyectoMongoDatasource());

export const buildModuloController = (): ModuloController => {
  const service = new ModuloCrudService(
    buildModuloRepository(),
    buildProyectoRepository(),
  );
  return new ModuloController(service);
};

export const buildProyectoController = (): ProyectoController => {
  const service = new ProyectoService(buildProyectoRepository());
  return new ProyectoController(service);
};
