import { ModuloTipo } from "../../entities/parking/modulo.entity";

const MODULO_TIPOS: ModuloTipo[] = ["ENTRADA", "SALIDA", "POS"];

export class UpdateModuloDto {
    private constructor(
        public readonly nombre?: string,
        public readonly proyecto?: string,
        public readonly tipo?: ModuloTipo,
        public readonly identificador?: string,
        public readonly estado?: boolean,
        public readonly descripcion?: string,
    ) {}

    static create(body: Record<string, unknown>): [string?, UpdateModuloDto?] {
        const tipo =
            typeof body.tipo === "string" ? body.tipo.trim().toUpperCase() : undefined;
        if (tipo !== undefined && !MODULO_TIPOS.includes(tipo as ModuloTipo)) {
            return ["'tipo' no es valido"];
        }

        return [
            undefined,
            new UpdateModuloDto(
                typeof body.nombre === "string" ? body.nombre.trim() : undefined,
                typeof body.proyecto === "string" ? body.proyecto.trim() : undefined,
                tipo as ModuloTipo | undefined,
                typeof body.identificador === "string"
                    ? body.identificador.trim()
                    : undefined,
                typeof body.estado === "boolean" ? body.estado : undefined,
                typeof body.descripcion === "string"
                    ? body.descripcion.trim()
                    : undefined,
            ),
        ];
    }
}
