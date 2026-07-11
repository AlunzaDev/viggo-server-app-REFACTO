export class CreateProyectoDto {
    private constructor(
        public readonly nombre: string,
        public readonly coordinates: number[],
        public readonly ciudad: string,
        public readonly identificador: string,
        public readonly img?: string,
        public readonly descripcion?: string,
        public readonly estado: boolean = true,
    ) {}

    static create(body: Record<string, unknown>): [string?, CreateProyectoDto?] {
        const nombre = typeof body.nombre === "string" ? body.nombre.trim() : "";
        const coordinates = Array.isArray(body.coordinates)
            ? body.coordinates.map((value) => Number(value))
            : [];
        const ciudad = typeof body.ciudad === "string" ? body.ciudad.trim() : "";
        const identificador =
            typeof body.identificador === "string" ? body.identificador.trim() : "";
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
                img,
                descripcion,
                estado,
            ),
        ];
    }
}
