import { ProveedorEntity } from "../../entities/proveedores/proveedor.entity";

export abstract class ProveedorDatasource {
    abstract create(proveedor: Omit<ProveedorEntity, "id">): Promise<ProveedorEntity>;
    abstract findByIdProveedor(idProveedor: number): Promise<ProveedorEntity | null>;
}