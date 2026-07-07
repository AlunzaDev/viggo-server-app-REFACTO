import { ProveedorDatasource } from "../../../domain/datasources/proveedores/proveedor.datasource";
import { ProveedorEntity } from "../../../domain/entities/proveedores/proveedor.entity";
import { ProveedorRepository } from "../../../domain/repository/proveedores/proveedor.repository";

export class ProveedorRepositoryImpl implements ProveedorRepository {
    constructor(private readonly proveedorDatasource: ProveedorDatasource) {}

    create(proveedor: Omit<ProveedorEntity, "id">): Promise<ProveedorEntity> {
        return this.proveedorDatasource.create(proveedor);
    }

    findByIdProveedor(idProveedor: number): Promise<ProveedorEntity | null> {
        return this.proveedorDatasource.findByIdProveedor(idProveedor);
    }
}