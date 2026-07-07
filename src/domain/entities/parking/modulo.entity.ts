import { CustomError } from "../../errors/custom.error";

export type ModuloTipo = "ENTRADA" | "SALIDA" | "POS";

export interface ModuloEntityOptions {
    id: string;
    nombre: string;
    proyecto: string;
    tipo: ModuloTipo;
    estado: boolean;
    identificador: string;
    descripcion?: string;
}

export class ModuloEntity {
    public id: string;
    public nombre: string;
    public proyecto: string;
    public tipo: ModuloTipo;
    public estado: boolean;
    public identificador: string;
    public descripcion?: string;

    constructor(options: ModuloEntityOptions) {
        const { id, nombre, proyecto, tipo, estado, identificador, descripcion } = options;

        this.id = id;
        this.nombre = nombre;
        this.proyecto = proyecto;
        this.tipo = tipo;
        this.estado = estado;
        this.identificador = identificador;
        this.descripcion = descripcion;
    }

    static fromObject(object: { [key: string]: unknown }): ModuloEntity {
        const { _id, id, nombre, proyecto, tipo, estado, identificador, descripcion } = object;

        const moduloId = id || (_id ? String(_id) : undefined);

        if (!moduloId) throw CustomError.badRequest("Missing id");
        if (!nombre) throw CustomError.badRequest("Missing nombre");
        if (!proyecto) throw CustomError.badRequest("Missing proyecto");
        if (!tipo) throw CustomError.badRequest("Missing tipo");
        if (estado === undefined || estado === null) {
            throw CustomError.badRequest("Missing estado");
        }
        if (!identificador) throw CustomError.badRequest("Missing identificador");

        return new ModuloEntity({
            id: String(moduloId),
            nombre: String(nombre).trim(),
            proyecto: String(proyecto),
            tipo: String(tipo) as ModuloTipo,
            estado: Boolean(estado),
            identificador: String(identificador).trim(),
            descripcion: typeof descripcion === "string" ? descripcion : undefined,
        });
    }
}
