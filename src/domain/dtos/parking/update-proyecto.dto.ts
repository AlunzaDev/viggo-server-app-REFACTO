export class UpdateProyectoDto {
    private constructor(
        public readonly nombre?: string,
        public readonly coordinates?: number[],
        public readonly ciudad?: string,
        public readonly identificador?: string,
        public readonly serverIp?: string,
        public readonly serverMac?: string,
        public readonly localApiBaseUrl?: string,
        public readonly img?: string,
        public readonly descripcion?: string,
        public readonly estado?: boolean,
    ) {}

    static create(body: Record<string, unknown>): [string?, UpdateProyectoDto?] {
        return [
            undefined,
            new UpdateProyectoDto(
                typeof body.nombre === "string" ? body.nombre.trim() : undefined,
                Array.isArray(body.coordinates)
                    ? body.coordinates.map((value) => Number(value))
                    : undefined,
                typeof body.ciudad === "string" ? body.ciudad.trim() : undefined,
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
                typeof body.img === "string" ? body.img.trim() : undefined,
                typeof body.descripcion === "string"
                    ? body.descripcion.trim()
                    : undefined,
                typeof body.estado === "boolean" ? body.estado : undefined,
            ),
        ];
    }
}
