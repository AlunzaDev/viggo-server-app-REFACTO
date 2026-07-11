export class CreateTicketDto {
    private constructor(
        public readonly proyecto: string,
        public readonly entrada: string,
        public readonly usuario: string,
        public readonly idBoleto: string,
        public readonly horaInicio: number,
        public readonly horaConsulta: number,
        public readonly horaCobro: number,
        public readonly horaSalida: number,
        public readonly duracion: number,
        public readonly monto: number,
        public readonly pagado: boolean,
        public readonly salida?: string,
    ) {}

    static create(body: Record<string, unknown>): [string?, CreateTicketDto?] {
        const proyecto = typeof body.proyecto === "string" ? body.proyecto.trim() : "";
        const entrada = typeof body.entrada === "string" ? body.entrada.trim() : "";
        const usuario = typeof body.usuario === "string" ? body.usuario.trim() : "";
        const idBoleto = typeof body.idBoleto === "string" ? body.idBoleto.trim() : "";
        const horaInicio = Number(body.horaInicio);
        const horaConsulta =
            body.horaConsulta === undefined ? -1 : Number(body.horaConsulta);
        const horaCobro = body.horaCobro === undefined ? -1 : Number(body.horaCobro);
        const horaSalida = body.horaSalida === undefined ? -1 : Number(body.horaSalida);
        const duracion = body.duracion === undefined ? 0 : Number(body.duracion);
        const monto = body.monto === undefined ? 0 : Number(body.monto);
        const pagado = typeof body.pagado === "boolean" ? body.pagado : false;
        const salida = typeof body.salida === "string" ? body.salida.trim() : undefined;

        if (!proyecto) return ["'proyecto' es requerido"];
        if (!entrada) return ["'entrada' es requerido"];
        if (!usuario) return ["'usuario' es requerido"];
        if (!idBoleto) return ["'idBoleto' es requerido"];
        if (!Number.isFinite(horaInicio)) return ["'horaInicio' es requerido"];

        return [
            undefined,
            new CreateTicketDto(
                proyecto,
                entrada,
                usuario,
                idBoleto,
                horaInicio,
                horaConsulta,
                horaCobro,
                horaSalida,
                duracion,
                monto,
                pagado,
                salida,
            ),
        ];
    }
}
