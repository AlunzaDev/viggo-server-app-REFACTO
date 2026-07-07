import { CreateProveedorDto } from "../../../domain/dtos/proveedores/create-proveedor.dto";
import { ProveedorEntity } from "../../../domain/entities/proveedores/proveedor.entity";
import { CustomError } from "../../../domain/errors/custom.error";
import { ProveedorRepository } from "../../../domain/repository/proveedores/proveedor.repository";

export class ProveedorService {
    constructor(private readonly proveedorRepository: ProveedorRepository) {}

    async createProveedor(dto: CreateProveedorDto): Promise<ProveedorEntity> {
        const proveedorExists = await this.proveedorRepository.findByIdProveedor(dto.idProveedor);

        if (proveedorExists) {
            throw CustomError.badRequest(
                `el proovedor con id ${dto.idProveedor} ya esta en DB`,
            );
        }

        return this.proveedorRepository.create({
            nombre: dto.nombre,
            idProveedor: dto.idProveedor,
            url: dto.url,
        });
    }
}
