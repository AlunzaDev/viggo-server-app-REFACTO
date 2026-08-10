export class CreateProyectoDto {
    private static normalizeRemoteSupport(value: unknown) {
        if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;

        const source = value as Record<string, unknown>;
        const provider = String(source.provider ?? "MESHCENTRAL").trim().toUpperCase();
        const baseUrl = typeof source.baseUrl === "string" ? source.baseUrl.trim() : "";
        const enabled = Boolean(source.enabled) || baseUrl.length > 0;

        if (provider !== "MESHCENTRAL") return undefined;
        if (!enabled && !baseUrl) return undefined;

        return {
            provider: "MESHCENTRAL" as const,
            enabled,
            baseUrl: baseUrl || undefined,
            updatedAt: new Date(),
        };
    }

    private static normalizeCoordinates(value: unknown): number[] | number[][] {
        if (!Array.isArray(value)) return [];

        if (
            value.length >= 2 &&
            !Array.isArray(value[0]) &&
            Number.isFinite(Number(value[0])) &&
            Number.isFinite(Number(value[1]))
        ) {
            return [Number(value[0]), Number(value[1])];
        }

        return value
            .map((point) =>
                Array.isArray(point) && point.length >= 2
                    ? [Number(point[0]), Number(point[1])]
                    : null,
            )
            .filter((point): point is number[] => Boolean(point))
            .filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]));
    }

    private constructor(
        public readonly nombre: string,
        public readonly coordinates: number[] | number[][],
        public readonly ciudad: string,
        public readonly identificador: string,
        public readonly direccion?: string,
        public readonly serverIp?: string,
        public readonly serverMac?: string,
        public readonly localApiBaseUrl?: string,
        public readonly remoteSupport?: ReturnType<typeof CreateProyectoDto.normalizeRemoteSupport>,
        public readonly img?: string,
        public readonly descripcion?: string,
        public readonly estado: boolean = true,
    ) {}

    static create(body: Record<string, unknown>): [string?, CreateProyectoDto?] {
        const nombre = typeof body.nombre === "string" ? body.nombre.trim() : "";
        const coordinates = CreateProyectoDto.normalizeCoordinates(body.coordinates);
        const ciudad = typeof body.ciudad === "string" ? body.ciudad.trim() : "";
        const direccion =
            typeof body.direccion === "string" && body.direccion.trim().length > 0
                ? body.direccion.trim()
                : undefined;
        const identificador =
            typeof body.identificador === "string" ? body.identificador.trim() : "";
        const serverIp =
            typeof body.serverIp === "string" && body.serverIp.trim().length > 0
                ? body.serverIp.trim()
                : undefined;
        const serverMac =
            typeof body.serverMac === "string" && body.serverMac.trim().length > 0
                ? body.serverMac.trim().toUpperCase()
                : undefined;
        const localApiBaseUrl =
            typeof body.localApiBaseUrl === "string" && body.localApiBaseUrl.trim().length > 0
                ? body.localApiBaseUrl.trim()
                : undefined;
        const remoteSupport = CreateProyectoDto.normalizeRemoteSupport(body.remoteSupport);
        const img =
            typeof body.img === "string" && body.img.trim().length > 0
                ? body.img.trim()
                : undefined;
        const descripcion =
            typeof body.descripcion === "string" && body.descripcion.trim().length > 0
                ? body.descripcion.trim()
                : undefined;
        const estado = typeof body.estado === "boolean" ? body.estado : true;

        if (!nombre) return ["'nombre' es requerido"];
        if (!coordinates.length) return ["'coordinates' es requerido"];
        if (!ciudad) return ["'ciudad' es requerido"];
        if (!identificador) return ["'identificador' es requerido"];

        return [
            undefined,
            new CreateProyectoDto(
                nombre,
                coordinates,
                ciudad,
                identificador,
                direccion,
                serverIp,
                serverMac,
                localApiBaseUrl,
                remoteSupport,
                img,
                descripcion,
                estado,
            ),
        ];
    }
}
