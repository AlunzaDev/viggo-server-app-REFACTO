import { CustomError } from "../../errors/custom.error";

export type PensionMoveTipo =
    | "ENTRADA"
    | "SALIDA"
    | "ENTRADA-PENSION"
    | "SALIDA-PENSION";

export interface PensionMoveEntityOptions {
    id: string;
    modulo: string;
    proyecto: string;
    pensionPass: string;
    tipo: PensionMoveTipo;
    fecha: number;
}

export class PensionMoveEntity {
    public id: string;
    public modulo: string;
    public proyecto: string;
    public pensionPass: string;
    public tipo: PensionMoveTipo;
    public fecha: number;

    constructor(options: PensionMoveEntityOptions) {
        const { id, modulo, proyecto, pensionPass, tipo, fecha } = options;

        this.id = id;
        this.modulo = modulo;
        this.proyecto = proyecto;
        this.pensionPass = pensionPass;
        this.tipo = tipo;
        this.fecha = fecha;
    }

    static fromObject(object: { [key: string]: unknown }): PensionMoveEntity {
        const { _id, id, modulo, proyecto, pensionPass, tipo, fecha } = object;

        const pensionMoveId = id || (_id ? String(_id) : undefined);

        if (!pensionMoveId) throw CustomError.badRequest("Missing id");
        if (!modulo) throw CustomError.badRequest("Missing modulo");
        if (!proyecto) throw CustomError.badRequest("Missing proyecto");
        if (!pensionPass) throw CustomError.badRequest("Missing pensionPass");
        if (!tipo) throw CustomError.badRequest("Missing tipo");
        if (fecha === undefined || fecha === null) {
            throw CustomError.badRequest("Missing fecha");
        }

        return new PensionMoveEntity({
            id: String(pensionMoveId),
            modulo: String(modulo),
            proyecto: String(proyecto),
            pensionPass: String(pensionPass),
            tipo: String(tipo) as PensionMoveTipo,
            fecha: Number(fecha),
        });
    }
}
