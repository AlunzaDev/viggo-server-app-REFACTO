import { Router } from "express";
import { ProveedorMongoDatasource } from "../../../infrastructure/datasources/proveedores/proveedor.datasource.mongo";
import { ProveedorRepositoryImpl } from "../../../infrastructure/repositories/proveedores/proveedor.repository.impl";
import { ProveedorController } from "./proveedor.controller";
import { ProveedorService } from "../../services/proveedores/proveedor.service";

export class ProveedorRoutes {
    static get routes(): Router {
        const router = Router();

        const datasource = new ProveedorMongoDatasource();
        const repository = new ProveedorRepositoryImpl(datasource);
        const service = new ProveedorService(repository);
        const controller = new ProveedorController(service);

        router.post("/", controller.createProveedor);

        return router;
    }
}
