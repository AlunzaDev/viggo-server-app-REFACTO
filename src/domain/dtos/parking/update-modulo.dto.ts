import {
    ModuloRemoteSupport,
} from "../../entities/parking/modulo.entity";
import {
    MODULO_TIPOS,
    ModuloTipo,
    parseModuloTipo,
} from "../../entities/parking/module-type.entity";
import { parseRemoteSupportProvider } from "../../entities/parking/remote-support.entity";

export class UpdateModuloDto {
    private constructor(
        public readonly nombre?: string,
        public readonly proyecto?: string,
        public readonly tipo?: ModuloTipo,
        public readonly identificador?: string,
        public readonly estado?: boolean,
        public readonly ip?: string,
        public readonly mac?: string,
        public readonly ubicacion?: string,
        public readonly coordinates?: [number, number],
        public readonly descripcion?: string,
        public readonly remoteSupport?: ModuloRemoteSupport | null,
    ) {}

    static create(body: Record<string, unknown>): [string?, UpdateModuloDto?] {
        const parsedTipo = body.tipo === undefined ? undefined : parseModuloTipo(body.tipo);
        if (body.tipo !== undefined && !parsedTipo) {
            return [`'tipo' debe ser uno de: ${MODULO_TIPOS.join(", ")}`];
        }
        const tipo = parsedTipo ?? undefined;

        return [
            undefined,
            new UpdateModuloDto(
                typeof body.nombre === "string" ? body.nombre.trim() : undefined,
                typeof body.proyecto === "string" ? body.proyecto.trim() : undefined,
                tipo,
                typeof body.identificador === "string"
                    ? body.identificador.trim()
                    : undefined,
                typeof body.estado === "boolean" ? body.estado : undefined,
                typeof body.ip === "string" ? body.ip.trim() : undefined,
                typeof body.mac === "string" ? body.mac.trim() : undefined,
                typeof body.ubicacion === "string" ? body.ubicacion.trim() : undefined,
                parseCoordinates(body.coordinates),
                typeof body.descripcion === "string"
                    ? body.descripcion.trim()
                    : undefined,
                parseRemoteSupport(body.remoteSupport),
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
