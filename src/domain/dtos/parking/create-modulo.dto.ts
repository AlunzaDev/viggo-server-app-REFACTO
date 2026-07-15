import { ModuloTipo } from "../../entities/parking/modulo.entity";

const MODULO_TIPOS: ModuloTipo[] = ["ENTRADA", "SALIDA", "POS"];

export class CreateModuloDto {
    private constructor(
        public readonly nombre: string,
        public readonly proyecto: string,
        public readonly tipo: ModuloTipo,
        public readonly identificador: string,
        public readonly estado: boolean = true,
        public readonly descripcion?: string,
    ) {}

    static create(body: Record<string, unknown>): [string?, CreateModuloDto?] {
        const nombre = typeof body.nombre === "string" ? body.nombre.trim() : "";
        const proyecto = typeof body.proyecto === "string" ? body.proyecto.trim() : "";
        const tipo = typeof body.tipo === "string" ? body.tipo.trim().toUpperCase() : "";
        const identificador =
            typeof body.identificador === "string" ? body.identificador.trim() : "";
        const estado = typeof body.estado === "boolean" ? body.estado : true;
        const descripcion =
            typeof body.descripcion === "string" && body.descripcion.trim().length > 0
                ? body.descripcion.trim()
                : undefined;

        if (!nombre) return ["'nombre' es requerido"];
        if (!proyecto) return ["'proyecto' es requerido"];
        if (!tipo) return ["'tipo' es requerido"];
        if (!MODULO_TIPOS.includes(tipo as ModuloTipo)) {
            return ["'tipo' no es valido"];
        }
        if (!identificador) return ["'identificador' es requerido"];

        return [
            undefined,
            new CreateModuloDto(
                nombre,
                proyecto,
                tipo as ModuloTipo,
                identificador,
                estado,
                descripcion,
            ),
        ];
    }
}
