import { CustomError } from "../../errors/custom.error";

export interface PensionValidezItemEntity {
    weekDay: number;
    from: number[];
    to: number[];
}

export interface PensionEntityOptions {
    id: string;
    proyecto: string;
    nombre: string;
    validez: PensionValidezItemEntity[];
    precio: number;
    descripcion?: string;
    estado: boolean;
}

export class PensionEntity {
    public id: string;
    public proyecto: string;
    public nombre: string;
    public validez: PensionValidezItemEntity[];
    public precio: number;
    public descripcion?: string;
    public estado: boolean;

    constructor(options: PensionEntityOptions) {
        const { id, proyecto, nombre, validez, precio, descripcion, estado } = options;

        this.id = id;
        this.proyecto = proyecto;
        this.nombre = nombre;
        this.validez = validez;
        this.precio = precio;
        this.descripcion = descripcion;
        this.estado = estado;
    }

    static fromObject(object: { [key: string]: unknown }): PensionEntity {
        const { _id, id, proyecto, nombre, validez, precio, descripcion, estado } = object;

        const pensionId = id || (_id ? String(_id) : undefined);

        if (!pensionId) throw CustomError.badRequest("Missing id");
        if (!proyecto) throw CustomError.badRequest("Missing proyecto");
        if (!nombre) throw CustomError.badRequest("Missing nombre");
        if (!Array.isArray(validez)) throw CustomError.badRequest("Missing validez");
        if (precio === undefined || precio === null) {
            throw CustomError.badRequest("Missing precio");
        }
        if (estado === undefined || estado === null) {
            throw CustomError.badRequest("Missing estado");
        }

        return new PensionEntity({
            id: String(pensionId),
            proyecto: String(proyecto),
            nombre: String(nombre).trim(),
            validez: validez.map((item) => {
                const validezItem = item as Record<string, unknown>;
                return {
                    weekDay: Number(validezItem.weekDay),
                    from: Array.isArray(validezItem.from)
                        ? validezItem.from.map((value) => Number(value))
                        : [],
                    to: Array.isArray(validezItem.to)
                        ? validezItem.to.map((value) => Number(value))
                        : [],
                };
            }),
            precio: Number(precio),
            descripcion: typeof descripcion === "string" ? descripcion : undefined,
            estado: Boolean(estado),
        });
    }
}
