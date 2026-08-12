import {
    ModuloRemoteSupport,
    ModuloTipo,
} from "../../entities/parking/modulo.entity";
import { ModuloSubmodulo } from "../../entities/parking/modulo.entity";
import { parseRemoteSupportProvider } from "../../entities/parking/remote-support.entity";

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
        public readonly remoteSupport?: ModuloRemoteSupport | null,
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
        const remoteSupport = parseRemoteSupport(body.remoteSupport);

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
                remoteSupport,
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

function parseRemoteSupport(value: unknown): ModuloRemoteSupport | null | undefined {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;

    const source = value as Record<string, unknown>;
    const provider = parseRemoteSupportProvider(source.provider);
    if (!provider) return null;

    return {
        provider,
        enabled: Boolean(source.enabled),
        deviceName: optionalText(source.deviceName),
        deviceId: optionalText(source.deviceId),
        groupId: optionalText(source.groupId),
        baseUrl: optionalText(source.baseUrl),
        supportUrl: optionalText(source.supportUrl),
        desktopUrl: optionalText(source.desktopUrl),
        terminalUrl: optionalText(source.terminalUrl),
        linkedAt: parseDate(source.linkedAt),
        updatedAt: parseDate(source.updatedAt) ?? new Date(),
    };
}

function optionalText(value: unknown): string | undefined {
    const text = String(value ?? "").trim();
    return text || undefined;
}

function parseDate(value: unknown): Date | undefined {
    if (value === undefined || value === null || value === "") return undefined;
    const date = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(date.getTime()) ? undefined : date;
}
