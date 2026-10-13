import { ModuloController } from "../routes/parking/modulo.controller";
import { ProyectoController } from "../routes/parking/proyecto.controller";
import { ModuloCrudService } from "../services/parking/modulo-crud.service";
import { ProyectoService } from "../services/parking/proyecto.service";
import { buildModuloRepository, buildProyectoRepository } from "./repositories.dependencies";


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
