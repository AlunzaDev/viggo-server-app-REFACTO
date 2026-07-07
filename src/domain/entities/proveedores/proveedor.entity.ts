import { CustomError } from "../../errors/custom.error";

export interface ProveedorEntityOptions {
    id: string;
    nombre: string;
    idProveedor: number;
    url?: string;
}

export class ProveedorEntity {
    public id: string;
    public nombre: string;
    public idProveedor: number;
    public url?: string;

    constructor(options: ProveedorEntityOptions) {
        const { id, nombre, idProveedor, url } = options;
        this.id = id;
        this.nombre = nombre;
        this.idProveedor = idProveedor;
        this.url = url;
    }

    static fromObject(object: { [key: string]: unknown }): ProveedorEntity {
        const { _id, id, nombre, idProveedor, url } = object;

        const proveedorId = id || (_id ? String(_id) : undefined);

        if (!proveedorId) throw CustomError.badRequest("Missing id");
        if (!nombre) throw CustomError.badRequest("Missing nombre");
        if (idProveedor === undefined || idProveedor === null) {
            throw CustomError.badRequest("Missing idProveedor");
        }

        return new ProveedorEntity({
            id: String(proveedorId),
            nombre: String(nombre).trim(),
            idProveedor: Number(idProveedor),
            url: typeof url === "string" ? url.trim() : undefined,
        });
    }
}
