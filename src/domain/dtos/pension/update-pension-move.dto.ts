import { PensionMoveTipo } from "../../entities/pension/pension-move.entity";

export class UpdatePensionMoveDto {
    private constructor(
        public readonly modulo?: string,
        public readonly proyecto?: string,
        public readonly pensionPass?: string,
        public readonly tipo?: PensionMoveTipo,
        public readonly fecha?: number,
    ) {}

    static create(body: Record<string, unknown>): [string?, UpdatePensionMoveDto?] {
        return [
            undefined,
            new UpdatePensionMoveDto(
                typeof body.modulo === "string" ? body.modulo.trim() : undefined,
                typeof body.proyecto === "string" ? body.proyecto.trim() : undefined,
                typeof body.pensionPass === "string" ? body.pensionPass.trim() : undefined,
                typeof body.tipo === "string" ? (body.tipo as PensionMoveTipo) : undefined,
                body.fecha !== undefined ? Number(body.fecha) : undefined,
            ),
        ];
    }
}
