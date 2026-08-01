import { ModuloTipo } from "../../entities/parking/modulo.entity";
import { ModuloSubmodulo } from "../../entities/parking/modulo.entity";

const MODULO_TIPOS: ModuloTipo[] = ["ENTRADA", "SALIDA", "POS"];

export class CreateModuloDto {
    private constructor(
        public readonly nombre: string,
        public readonly proyecto: string,
        public readonly tipo: ModuloTipo,
        public readonly identificador: string,
        public readonly estado: boolean = true,
        public readonly ip?: string,
        public readonly mac?: string,
        public readonly ubicacion?: string,
        public readonly coordinates?: [number, number],
        public readonly descripcion?: string,
        public readonly submodulos: ModuloSubmodulo[] = [],
    ) {}

    static create(body: Record<string, unknown>): [string?, CreateModuloDto?] {
        const nombre = typeof body.nombre === "string" ? body.nombre.trim() : "";
        const proyecto = typeof body.proyecto === "string" ? body.proyecto.trim() : "";
        const tipo = typeof body.tipo === "string" ? body.tipo.trim().toUpperCase() : "";
        const identificador =
            typeof body.identificador === "string" ? body.identificador.trim() : "";
        const estado = typeof body.estado === "boolean" ? body.estado : true;
        const ip =
            typeof body.ip === "string" && body.ip.trim().length > 0
                ? body.ip.trim()
                : undefined;
        const mac =
            typeof body.mac === "string" && body.mac.trim().length > 0
                ? body.mac.trim()
                : undefined;
        const ubicacion =
            typeof body.ubicacion === "string" && body.ubicacion.trim().length > 0
                ? body.ubicacion.trim()
                : undefined;
        const coordinates = parseCoordinates(body.coordinates);
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
                ip,
                mac,
                ubicacion,
                coordinates,
                descripcion,
            ),
        ];
    }
}

function parseCoordinates(value: unknown): [number, number] | undefined {
    if (!Array.isArray(value) || value.length !== 2) return undefined;
    const longitude = Number(value[0]);
    const latitude = Number(value[1]);
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return undefined;
    return [longitude, latitude];
}
