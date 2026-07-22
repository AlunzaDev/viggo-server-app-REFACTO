import { normalizeUserModules, type UserModuleAccess } from "../../constants";

export class CreatePermissionProfileDto {
  private constructor(
    public readonly nombre: string,
    public readonly modules: UserModuleAccess[],
    public readonly descripcion?: string,
    public readonly estado: boolean = true,
  ) {}

  static create(
    body: Record<string, unknown>,
  ): [string?, CreatePermissionProfileDto?] {
    const nombre = typeof body.nombre === "string" ? body.nombre.trim() : "";
    const descripcion =
      typeof body.descripcion === "string" && body.descripcion.trim().length > 0
        ? body.descripcion.trim()
        : undefined;
    const modules = normalizeUserModules(body.modules);
    const estado = typeof body.estado === "boolean" ? body.estado : true;

    if (!nombre) return ["'nombre' es requerido"];
    if (!Array.isArray(body.modules) || modules.length === 0) {
      return ["'modules' debe incluir al menos un modulo"];
    }

    return [
      undefined,
      new CreatePermissionProfileDto(nombre, modules, descripcion, estado),
    ];
  }
}
