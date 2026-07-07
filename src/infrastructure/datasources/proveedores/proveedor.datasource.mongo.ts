import { ProveedorModel } from "../../../data/mongo/models/proveedores/proveedor.schema";
import { ProveedorDatasource } from "../../../domain/datasources/proveedores/proveedor.datasource";
import { ProveedorEntity } from "../../../domain/entities/proveedores/proveedor.entity";

export class ProveedorMongoDatasource extends ProveedorDatasource {
    async create(proveedor: Omit<ProveedorEntity, "id">): Promise<ProveedorEntity> {
        const proveedorDocument = await ProveedorModel.create(proveedor);
        const proveedorObject = proveedorDocument.toObject();

        return this.mapDocument(proveedorObject);
    }

    async findByIdProveedor(idProveedor: number): Promise<ProveedorEntity | null> {
        const proveedorDocument = await ProveedorModel.findOne({ idProveedor }).lean();
        if (!proveedorDocument) return null;

        return this.mapDocument(proveedorDocument);
    }

    private mapDocument(
        proveedorObject: Record<string, unknown> & {
            _id?: unknown;
            nombre: string;
            idProveedor: number;
            url?: string | null;
        },
    ): ProveedorEntity {
        return {
            id: String(proveedorObject._id),
            nombre: proveedorObject.nombre,
            idProveedor: proveedorObject.idProveedor,
            url: proveedorObject.url ?? undefined,
        };
    }
}
