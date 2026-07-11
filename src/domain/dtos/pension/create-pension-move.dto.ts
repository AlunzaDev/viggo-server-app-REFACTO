import { PensionMoveTipo } from "../../entities/pension/pension-move.entity";

export class CreatePensionMoveDto {
    private constructor(
        public readonly modulo: string,
        public readonly proyecto: string,
        public readonly pensionPass: string,
        public readonly tipo: PensionMoveTipo,
        public readonly fecha: number,
    ) {}

    static create(body: Record<string, unknown>): [string?, CreatePensionMoveDto?] {
        const modulo = typeof body.modulo === "string" ? body.modulo.trim() : "";
        const proyecto = typeof body.proyecto === "string" ? body.proyecto.trim() : "";
        const pensionPass =
            typeof body.pensionPass === "string" ? body.pensionPass.trim() : "";
        const tipo =
            typeof body.tipo === "string" ? (body.tipo as PensionMoveTipo) : undefined;
        const fecha = Number(body.fecha);

        if (!modulo) return ["'modulo' es requerido"];
        if (!proyecto) return ["'proyecto' es requerido"];
        if (!pensionPass) return ["'pensionPass' es requerido"];
        if (!tipo) return ["'tipo' es requerido"];
        if (!Number.isFinite(fecha)) return ["'fecha' es requerido"];

        return [
            undefined,
            new CreatePensionMoveDto(modulo, proyecto, pensionPass, tipo, fecha),
        ];
    }
}
