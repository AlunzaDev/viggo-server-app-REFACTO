import { PensionValidezItemEntity } from "../../entities/pension/pension.entity";

export class UpdatePensionDto {
    private constructor(
        public readonly proyecto?: string,
        public readonly nombre?: string,
        public readonly validez?: PensionValidezItemEntity[],
        public readonly precio?: number,
        public readonly estado?: boolean,
        public readonly descripcion?: string,
    ) {}

    static create(body: Record<string, unknown>): [string?, UpdatePensionDto?] {
        return [
            undefined,
            new UpdatePensionDto(
                typeof body.proyecto === "string" ? body.proyecto.trim() : undefined,
                typeof body.nombre === "string" ? body.nombre.trim() : undefined,
                Array.isArray(body.validez)
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
                    : undefined,
                body.precio !== undefined ? Number(body.precio) : undefined,
                typeof body.estado === "boolean" ? body.estado : undefined,
                typeof body.descripcion === "string"
                    ? body.descripcion.trim()
                    : undefined,
            ),
        ];
    }
}
