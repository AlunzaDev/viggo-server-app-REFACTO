import {
  getInvalidUserModules,
  normalizeUserModules,
  type UserModuleAccess,
} from "../../constants";

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
    if (body.app !== undefined) {
      return ["'app' no puede modificarse después de crear el perfil"];
    }

    const nombre =
      typeof body.nombre === "string" ? body.nombre.trim() : undefined;

    const descripcion =
      typeof body.descripcion === "string"
        ? body.descripcion.trim()
        : undefined;

    const estado = typeof body.estado === "boolean" ? body.estado : undefined;

    if (nombre !== undefined && !nombre) {
      return ["'nombre' no puede ir vacío"];
    }

    let modules: UserModuleAccess[] | undefined;

    if (body.modules !== undefined) {
      if (!Array.isArray(body.modules)) {
        return ["'modules' debe ser un arreglo"];
      }

      const invalidModules = getInvalidUserModules(body.modules);

      if (invalidModules.length > 0) {
        return [`Módulos inválidos: ${invalidModules.join(", ")}`];
      }

      modules = normalizeUserModules(body.modules);

      if (modules.length === 0) {
        return ["'modules' debe incluir al menos un módulo válido"];
      }
    }

    const dto = new UpdatePermissionProfileDto(
      nombre,
      modules,
      descripcion,
      estado,
    );

    if (
      nombre === undefined &&
      modules === undefined &&
      descripcion === undefined &&
      estado === undefined
    ) {
      return ["Debes enviar al menos un campo para actualizar"];
    }

    return [undefined, dto];
  }
}
