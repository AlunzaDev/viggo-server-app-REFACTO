import { CustomError } from "../../errors/custom.error";

export interface TicketEntityOptions {
    id: string;
    proyecto: string;
    entrada: string;
    usuario: string;
    idBoleto: string;
    horaInicio: number;
    salida?: string;
    horaConsulta: number;
    horaCobro: number;
    horaSalida: number;
    duracion: number;
    monto: number;
    pagado: boolean;
}

export class TicketEntity {
    public id: string;
    public proyecto: string;
    public entrada: string;
    public usuario: string;
    public idBoleto: string;
    public horaInicio: number;
    public salida?: string;
    public horaConsulta: number;
    public horaCobro: number;
    public horaSalida: number;
    public duracion: number;
    public monto: number;
    public pagado: boolean;

    constructor(options: TicketEntityOptions) {
        const {
            id,
            proyecto,
            entrada,
            usuario,
            idBoleto,
            horaInicio,
            salida,
            horaConsulta,
            horaCobro,
            horaSalida,
            duracion,
            monto,
            pagado,
        } = options;

        this.id = id;
        this.proyecto = proyecto;
        this.entrada = entrada;
        this.usuario = usuario;
        this.idBoleto = idBoleto;
        this.horaInicio = horaInicio;
        this.salida = salida;
        this.horaConsulta = horaConsulta;
        this.horaCobro = horaCobro;
        this.horaSalida = horaSalida;
        this.duracion = duracion;
        this.monto = monto;
        this.pagado = pagado;
    }

    static fromObject(object: { [key: string]: unknown }): TicketEntity {
        const {
            _id,
            id,
            proyecto,
            entrada,
            usuario,
            idBoleto,
            horaInicio,
            salida,
            horaConsulta,
            horaCobro,
            horaSalida,
            duracion,
            monto,
            pagado,
        } = object;

        const ticketId = id || (_id ? String(_id) : undefined);

        if (!ticketId) throw CustomError.badRequest("Missing id");
        if (!proyecto) throw CustomError.badRequest("Missing proyecto");
        if (!entrada) throw CustomError.badRequest("Missing entrada");
        if (!usuario) throw CustomError.badRequest("Missing usuario");
        if (!idBoleto) throw CustomError.badRequest("Missing idBoleto");
        if (horaInicio === undefined || horaInicio === null) {
            throw CustomError.badRequest("Missing horaInicio");
        }
        if (horaConsulta === undefined || horaConsulta === null) {
            throw CustomError.badRequest("Missing horaConsulta");
        }
        if (horaCobro === undefined || horaCobro === null) {
            throw CustomError.badRequest("Missing horaCobro");
        }
        if (horaSalida === undefined || horaSalida === null) {
            throw CustomError.badRequest("Missing horaSalida");
        }
        if (duracion === undefined || duracion === null) {
            throw CustomError.badRequest("Missing duracion");
        }
        if (monto === undefined || monto === null) {
            throw CustomError.badRequest("Missing monto");
        }
        if (pagado === undefined || pagado === null) {
            throw CustomError.badRequest("Missing pagado");
        }

        return new TicketEntity({
            id: String(ticketId),
            proyecto: String(proyecto),
            entrada: String(entrada),
            usuario: String(usuario),
            idBoleto: String(idBoleto).trim(),
            horaInicio: Number(horaInicio),
            salida: salida ? String(salida) : undefined,
            horaConsulta: Number(horaConsulta),
            horaCobro: Number(horaCobro),
            horaSalida: Number(horaSalida),
            duracion: Number(duracion),
            monto: Number(monto),
            pagado: Boolean(pagado),
        });
    }
}
