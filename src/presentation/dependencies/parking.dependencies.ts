import { ModuloController } from "../routes/parking/modulo.controller";
import { ParkingRateCopyPostgresDatasource } from "../../infrastructure/datasources/parking/parking-rate-copy.datasource.postgres";
import { ProyectoController } from "../routes/parking/proyecto.controller";
import { ModuloCrudService } from "../services/parking/modulo-crud.service";
import { ProyectoService } from "../services/parking/proyecto.service";
import { buildModuloRepository, buildProyectoRepository } from "./repositories.dependencies";
import { buildPaymentProviderRepository } from "./repositories.dependencies";
import { PaymentProviderController } from "../routes/parking/payment-provider.controller";
import { PaymentProviderService } from "../services/parking/payment-provider.service";
import { PostgresExternalProviderDirectory } from "../../infrastructure/external-payments/provider-directory.postgres";


export const buildModuloController = (): ModuloController => {
  const service = new ModuloCrudService(
    buildModuloRepository(),
    buildProyectoRepository(),
  );
  return new ModuloController(service);
};

export const buildProyectoController = (): ProyectoController => {
  const service = new ProyectoService(buildProyectoRepository());
  return new ProyectoController(service, new ParkingRateCopyPostgresDatasource());
};

export const buildPaymentProviderController = () =>
  new PaymentProviderController(new PaymentProviderService(buildPaymentProviderRepository(), new PostgresExternalProviderDirectory()));
