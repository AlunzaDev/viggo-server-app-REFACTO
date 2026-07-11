export class UpdateTicketDto {
    private constructor(
        public readonly proyecto?: string,
        public readonly entrada?: string,
        public readonly usuario?: string,
        public readonly idBoleto?: string,
        public readonly horaInicio?: number,
        public readonly horaConsulta?: number,
        public readonly horaCobro?: number,
        public readonly horaSalida?: number,
        public readonly duracion?: number,
        public readonly monto?: number,
        public readonly pagado?: boolean,
        public readonly salida?: string,
    ) {}

    static create(body: Record<string, unknown>): [string?, UpdateTicketDto?] {
        return [
            undefined,
            new UpdateTicketDto(
                typeof body.proyecto === "string" ? body.proyecto.trim() : undefined,
                typeof body.entrada === "string" ? body.entrada.trim() : undefined,
                typeof body.usuario === "string" ? body.usuario.trim() : undefined,
                typeof body.idBoleto === "string" ? body.idBoleto.trim() : undefined,
                body.horaInicio !== undefined ? Number(body.horaInicio) : undefined,
                body.horaConsulta !== undefined ? Number(body.horaConsulta) : undefined,
                body.horaCobro !== undefined ? Number(body.horaCobro) : undefined,
                body.horaSalida !== undefined ? Number(body.horaSalida) : undefined,
                body.duracion !== undefined ? Number(body.duracion) : undefined,
                body.monto !== undefined ? Number(body.monto) : undefined,
                typeof body.pagado === "boolean" ? body.pagado : undefined,
                typeof body.salida === "string" ? body.salida.trim() : undefined,
            ),
        ];
    }
}
