export class UpdateProyectoDto {
    private static normalizeRemoteSupport(value: unknown) {
        if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;

        const source = value as Record<string, unknown>;
        const provider = String(source.provider ?? "MESHCENTRAL").trim().toUpperCase();
        const baseUrl = typeof source.baseUrl === "string" ? source.baseUrl.trim() : "";
        const enabled = Boolean(source.enabled) || baseUrl.length > 0;

        if (provider !== "MESHCENTRAL") return undefined;

        return {
            provider: "MESHCENTRAL" as const,
            enabled,
            baseUrl: baseUrl || undefined,
            updatedAt: new Date(),
        };
    }

    private static normalizeCoordinates(value: unknown): number[] | number[][] | undefined {
        if (!Array.isArray(value)) return undefined;

        if (
            value.length >= 2 &&
            !Array.isArray(value[0]) &&
            Number.isFinite(Number(value[0])) &&
            Number.isFinite(Number(value[1]))
        ) {
            return [Number(value[0]), Number(value[1])];
        }

        const points = value
            .map((point) =>
                Array.isArray(point) && point.length >= 2
                    ? [Number(point[0]), Number(point[1])]
                    : null,
            )
            .filter((point): point is number[] => Boolean(point))
            .filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]));

        return points.length ? points : undefined;
    }

    private constructor(
        public readonly nombre?: string,
        public readonly coordinates?: number[] | number[][],
        public readonly ciudad?: string,
        public readonly direccion?: string,
        public readonly identificador?: string,
        public readonly serverIp?: string,
        public readonly serverMac?: string,
        public readonly localApiBaseUrl?: string,
        public readonly remoteSupport?: ReturnType<typeof UpdateProyectoDto.normalizeRemoteSupport>,
        public readonly img?: string,
        public readonly descripcion?: string,
        public readonly estado?: boolean,
    ) {}

    static create(body: Record<string, unknown>): [string?, UpdateProyectoDto?] {
        return [
            undefined,
            new UpdateProyectoDto(
                typeof body.nombre === "string" ? body.nombre.trim() : undefined,
                UpdateProyectoDto.normalizeCoordinates(body.coordinates),
                typeof body.ciudad === "string" ? body.ciudad.trim() : undefined,
                typeof body.direccion === "string"
                    ? body.direccion.trim()
                    : undefined,
                typeof body.identificador === "string"
                    ? body.identificador.trim()
                    : undefined,
                typeof body.serverIp === "string"
                    ? body.serverIp.trim()
                    : undefined,
                typeof body.serverMac === "string"
                    ? body.serverMac.trim().toUpperCase()
                    : undefined,
                typeof body.localApiBaseUrl === "string"
                    ? body.localApiBaseUrl.trim()
                    : undefined,
                UpdateProyectoDto.normalizeRemoteSupport(body.remoteSupport),
                typeof body.img === "string" ? body.img.trim() : undefined,
                typeof body.descripcion === "string"
                    ? body.descripcion.trim()
                    : undefined,
                typeof body.estado === "boolean" ? body.estado : undefined,
            ),
        ];
    }
}
