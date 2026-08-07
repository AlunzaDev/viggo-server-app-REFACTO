import {
  getInvalidUserModulesForApp,
  isUserAppAccess,
  normalizeUserModulesForApp,
  type UserAppAccess,
  type UserModuleAccess,
} from "../../constants";

export class CreatePermissionProfileDto {
  private constructor(
    public readonly app: UserAppAccess,
    public readonly nombre: string,
    public readonly modules: UserModuleAccess[],
    public readonly descripcion?: string,
    public readonly estado: boolean = true,
  ) {}

  static create(
    body: Record<string, unknown>,
  ): [string?, CreatePermissionProfileDto?] {
    const app = body.app;

    const nombre = typeof body.nombre === "string" ? body.nombre.trim() : "";

    const descripcion =
      typeof body.descripcion === "string" && body.descripcion.trim().length > 0
        ? body.descripcion.trim()
        : undefined;

    const estado = typeof body.estado === "boolean" ? body.estado : true;

    if (!isUserAppAccess(app)) {
      return ["'app' no es una aplicación válida"];
    }

    if (!nombre) {
      return ["'nombre' es requerido"];
    }

    if (!Array.isArray(body.modules)) {
      return ["'modules' debe ser un arreglo"];
    }

    const invalidModules = getInvalidUserModulesForApp(body.modules, app);

    if (invalidModules.length > 0) {
      return [
        `Los siguientes módulos no pertenecen a ${app}: ${invalidModules.join(", ")}`,
      ];
    }

    const modules = normalizeUserModulesForApp(body.modules, app);

    if (modules.length === 0) {
      return [
        "'modules' debe incluir al menos un módulo válido para la aplicación seleccionada",
      ];
    }

    return [
      undefined,
      new CreatePermissionProfileDto(app, nombre, modules, descripcion, estado),
    ];
  }
}
