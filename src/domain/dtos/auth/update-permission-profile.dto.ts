import { normalizeUserModules, type UserModuleAccess } from "../../constants";

export class UpdatePermissionProfileDto {
  private constructor(
    public readonly nombre?: string,
    public readonly modules?: UserModuleAccess[],
    public readonly descripcion?: string,
    public readonly estado?: boolean,
  ) {}

  static create(
    body: Record<string, unknown>,
  ): [string?, UpdatePermissionProfileDto?] {
    const nombre =
      typeof body.nombre === "string" ? body.nombre.trim() : undefined;
    const descripcion =
      typeof body.descripcion === "string" ? body.descripcion.trim() : undefined;
    const modules =
      body.modules === undefined ? undefined : normalizeUserModules(body.modules);
    const estado = typeof body.estado === "boolean" ? body.estado : undefined;

    if (nombre !== undefined && !nombre) return ["'nombre' no puede ir vacio"];
    if (
      body.modules !== undefined &&
      (!Array.isArray(body.modules) || (modules?.length ?? 0) === 0)
    ) {
      return ["'modules' debe incluir al menos un modulo"];
    }

    const dto = new UpdatePermissionProfileDto(
      nombre,
      modules,
      descripcion,
      estado,
    );

    if (Object.values(dto).every((value) => value === undefined)) {
      return ["Debes enviar al menos un campo para actualizar"];
    }

    return [undefined, dto];
  }
}
