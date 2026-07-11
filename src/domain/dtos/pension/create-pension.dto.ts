import { PensionValidezItemEntity } from "../../entities/pension/pension.entity";

export class CreatePensionDto {
    private constructor(
        public readonly proyecto: string,
        public readonly nombre: string,
        public readonly validez: PensionValidezItemEntity[],
        public readonly precio: number,
        public readonly estado: boolean = true,
        public readonly descripcion?: string,
    ) {}

    static create(body: Record<string, unknown>): [string?, CreatePensionDto?] {
        const proyecto = typeof body.proyecto === "string" ? body.proyecto.trim() : "";
        const nombre = typeof body.nombre === "string" ? body.nombre.trim() : "";
        const validez = Array.isArray(body.validez)
            ? body.validez.map((item) => {
                  const value = item as Record<string, unknown>;
                  return {
                      weekDay: Number(value.weekDay),
                      from: Array.isArray(value.from)
                          ? value.from.map((entry) => Number(entry))
                          : [],
                      to: Array.isArray(value.to)
                          ? value.to.map((entry) => Number(entry))
                          : [],
                  };
              })
            : [];
        const precio = Number(body.precio);
        const estado = typeof body.estado === "boolean" ? body.estado : true;
        const descripcion =
            typeof body.descripcion === "string" && body.descripcion.trim().length > 0
                ? body.descripcion.trim()
                : undefined;

        if (!proyecto) return ["'proyecto' es requerido"];
        if (!nombre) return ["'nombre' es requerido"];
        if (!validez.length) return ["'validez' es requerido"];
        if (!Number.isFinite(precio)) return ["'precio' es requerido"];

        return [
            undefined,
            new CreatePensionDto(proyecto, nombre, validez, precio, estado, descripcion),
        ];
    }
}
