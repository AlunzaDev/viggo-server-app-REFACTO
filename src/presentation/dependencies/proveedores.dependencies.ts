import { ProveedorMongoDatasource } from "../../infrastructure/datasources/proveedores/proveedor.datasource.mongo";
import { ProveedorRepositoryImpl } from "../../infrastructure/repositories/proveedores/proveedor.repository.impl";
import { ProveedorController } from "../routes/proveedores/proveedor.controller";
import { ProveedorService } from "../services/proveedores/proveedor.service";

export const buildProveedorController = (): ProveedorController => {
  const datasource = new ProveedorMongoDatasource();
  const repository = new ProveedorRepositoryImpl(datasource);
  const service = new ProveedorService(repository);

  return new ProveedorController(service);
};
