import { Request, Response } from "express";
import { CreateProveedorDto } from "../../../domain/dtos/proveedores/create-proveedor.dto";
import { ErrorService } from "../../services/error.service";
import { ProveedorService } from "../../services/proveedores/proveedor.service";

export class ProveedorController {
    constructor(private readonly proveedorService: ProveedorService) {}

    createProveedor = async (req: Request, res: Response) => {
        try {
            const [error, dto] = CreateProveedorDto.create(req.body);

            if (error || !dto) {
                return res.status(400).json({ error });
            }

            const proveedor = await this.proveedorService.createProveedor(dto);

            return res.status(201).json({ proveedor });
        } catch (error) {
            return ErrorService.handleApiError(error, res);
        }
    };
}
