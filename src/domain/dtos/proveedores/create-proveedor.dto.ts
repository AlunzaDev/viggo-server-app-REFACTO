export class CreateProveedorDto {
    private constructor(
        public readonly nombre: string,
        public readonly idProveedor: number,
        public readonly url?: string,
    ) {}

    static create(body: Record<string, unknown>): [string?, CreateProveedorDto?] {
        const nombre = typeof body.nombre === "string" ? body.nombre.trim() : "";
        const idProveedorValue =
            typeof body.idProveedor === "number"
                ? body.idProveedor
                : Number(body.idProveedor);
        const url =
            typeof body.url === "string" && body.url.trim().length > 0
                ? body.url.trim()
                : undefined;

        if (!nombre) return ["'nombre' es requerido"];
        if (!Number.isInteger(idProveedorValue)) {
            return ["'idProveedor' debe ser un numero entero"];
        }

        return [undefined, new CreateProveedorDto(nombre, idProveedorValue, url)];
    }
}