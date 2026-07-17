import { ModuloMongoDatasource } from "../../infrastructure/datasources/parking/modulo.datasource.mongo";
import { ProyectoMongoDatasource } from "../../infrastructure/datasources/parking/proyecto.datasource.mongo";
import { TicketMongoDatasource } from "../../infrastructure/datasources/parking/ticket.datasource.mongo";
import { ModuloRepositoryImpl } from "../../infrastructure/repositories/parking/modulo.repository.impl";
import { ProyectoRepositoryImpl } from "../../infrastructure/repositories/parking/proyecto.repository.impl";
import { TicketRepositoryImpl } from "../../infrastructure/repositories/parking/ticket.repository.impl";
import { ModuloController } from "../routes/parking/modulo.controller";
import { ProyectoController } from "../routes/parking/proyecto.controller";
import { TicketController } from "../routes/parking/ticket.controller";
import { ModuloService } from "../services/parking/modulo.service";
import { ProyectoService } from "../services/parking/proyecto.service";
import { TicketService } from "../services/parking/ticket.service";

const buildModuloRepository = () =>
  new ModuloRepositoryImpl(new ModuloMongoDatasource());

const buildProyectoRepository = () =>
  new ProyectoRepositoryImpl(new ProyectoMongoDatasource());

const buildTicketRepository = () =>
  new TicketRepositoryImpl(new TicketMongoDatasource());

export const buildModuloService = (): ModuloService =>
  new ModuloService(buildModuloRepository(), buildProyectoRepository());

export const buildModuloController = (): ModuloController => {
  const service = buildModuloService();

  return new ModuloController(service);
};

export const buildProyectoController = (): ProyectoController => {
  const service = new ProyectoService(buildProyectoRepository());

  return new ProyectoController(service);
};

export const buildTicketController = (): TicketController => {
  const service = new TicketService(
    buildTicketRepository(),
    buildProyectoRepository(),
    buildModuloRepository(),
  );

  return new TicketController(service);
};
