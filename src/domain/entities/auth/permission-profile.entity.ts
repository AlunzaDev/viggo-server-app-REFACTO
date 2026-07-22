import { normalizeUserModules, type UserModuleAccess } from "../../constants";
import { CustomError } from "../../errors/custom.error";

export interface PermissionProfileEntityOptions {
  id: string;
  nombre: string;
  descripcion?: string;
  modules: UserModuleAccess[];
  estado: boolean;
}

export class PermissionProfileEntity {
  public id: string;
  public nombre: string;
  public descripcion?: string;
  public modules: UserModuleAccess[];
  public estado: boolean;

  constructor(options: PermissionProfileEntityOptions) {
    this.id = options.id;
    this.nombre = options.nombre;
    this.descripcion = options.descripcion;
    this.modules = options.modules;
    this.estado = options.estado;
  }

  static fromObject(object: Record<string, unknown>): PermissionProfileEntity {
    const profileId = object.id ?? object._id;
    if (!profileId) throw CustomError.badRequest("Missing permission profile id");

    const nombre = typeof object.nombre === "string" ? object.nombre.trim() : "";
    if (!nombre) {
      throw CustomError.badRequest("Missing permission profile nombre");
    }

    return new PermissionProfileEntity({
      id: String(profileId),
      nombre,
      descripcion:
        typeof object.descripcion === "string" && object.descripcion.trim().length > 0
          ? object.descripcion.trim()
          : undefined,
      modules: normalizeUserModules(object.modules),
      estado: object.estado === undefined ? true : Boolean(object.estado),
    });
  }
}
