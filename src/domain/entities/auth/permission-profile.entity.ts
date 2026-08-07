import {
  isUserAppAccess,
  getInvalidUserModulesForApp,
  normalizeUserModulesForApp,
  type UserAppAccess,
  type UserModuleAccess,
} from "../../constants";
import { CustomError } from "../../errors/custom.error";

export interface PermissionProfileEntityOptions {
  id: string;
  app: UserAppAccess;
  nombre: string;
  descripcion?: string;
  modules: UserModuleAccess[];
  estado: boolean;
}

export class PermissionProfileEntity {
  public id: string;
  public app: UserAppAccess;
  public nombre: string;
  public descripcion?: string;
  public modules: UserModuleAccess[];
  public estado: boolean;

  constructor(options: PermissionProfileEntityOptions) {
    this.id = options.id;
    this.app = options.app;
    this.nombre = options.nombre;
    this.descripcion = options.descripcion;
    this.modules = options.modules;
    this.estado = options.estado;
  }

  static fromObject(object: Record<string, unknown>): PermissionProfileEntity {
    const profileId = object.id ?? object._id;

    if (!profileId) {
      throw CustomError.badRequest("Missing permission profile id");
    }

    if (!isUserAppAccess(object.app)) {
      throw CustomError.badRequest("Missing or invalid permission profile app");
    }

    const nombre =
      typeof object.nombre === "string" ? object.nombre.trim() : "";

    if (!nombre) {
      throw CustomError.badRequest("Missing permission profile nombre");
    }

    if (!Array.isArray(object.modules)) {
      throw CustomError.badRequest("Invalid permission profile modules");
    }

    const invalidModules = getInvalidUserModulesForApp(
      object.modules,
      object.app,
    );

    if (invalidModules.length > 0) {
      throw CustomError.badRequest(
        `Permission profile contains modules invalid for ${object.app}: ${invalidModules.join(", ")}`,
      );
    }

    return new PermissionProfileEntity({
      id: String(profileId),
      app: object.app,
      nombre,
      descripcion:
        typeof object.descripcion === "string" &&
        object.descripcion.trim().length > 0
          ? object.descripcion.trim()
          : undefined,
      modules: normalizeUserModulesForApp(object.modules, object.app),
      estado: object.estado === undefined ? true : Boolean(object.estado),
    });
  }
}
