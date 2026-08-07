import {
  isUserAppAccess,
  isUsuarioRol,
  normalizeUserApps,
  normalizeUserParkings,
  type UserAppAccess,
  type UsuarioRol,
} from "../../constants";
import { CustomError } from "../../errors/custom.error";

export interface UserAppPermission {
  app: UserAppAccess;
  permissionProfileId: string;
}

export interface UsuarioEntityOptions {
  id: string;
  nombre: string;
  apellido: string;
  correo: string;
  telefono: string;
  coordinates?: number[];
  password: string;
  emailValidated: boolean;
  rol: UsuarioRol;
  parkings: string[];
  nacimiento?: number;
  img?: string;
  estado: boolean;
  google: boolean;
  allowedApps: UserAppAccess[];
  appPermissions: UserAppPermission[];
}

const normalizeUserAppPermissions = (
  value: unknown,
  allowedApps: UserAppAccess[],
): UserAppPermission[] => {
  if (!Array.isArray(value)) return [];

  const allowedAppSet = new Set<UserAppAccess>(allowedApps);
  const permissionsByApp = new Map<UserAppAccess, UserAppPermission>();

  for (const item of value) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      continue;
    }

    const permission = item as Record<string, unknown>;
    const app = permission.app;
    const permissionProfileId =
      typeof permission.permissionProfileId === "string"
        ? permission.permissionProfileId.trim()
        : "";

    if (
      !isUserAppAccess(app) ||
      !allowedAppSet.has(app) ||
      !permissionProfileId
    ) {
      continue;
    }

    permissionsByApp.set(app, {
      app,
      permissionProfileId,
    });
  }

  return Array.from(permissionsByApp.values());
};

export class UsuarioEntity {
  public id: string;
  public nombre: string;
  public apellido: string;
  public correo: string;
  public telefono: string;
  public coordinates?: number[];
  public password: string;
  public emailValidated: boolean;
  public rol: UsuarioRol;
  public parkings: string[];
  public nacimiento?: number;
  public img?: string;
  public estado: boolean;
  public google: boolean;
  public allowedApps: UserAppAccess[];
  public appPermissions: UserAppPermission[];

  constructor(options: UsuarioEntityOptions) {
    const {
      id,
      nombre,
      apellido,
      correo,
      telefono,
      coordinates,
      password,
      emailValidated,
      rol,
      parkings,
      nacimiento,
      img,
      estado,
      google,
      allowedApps,
      appPermissions,
    } = options;

    this.id = id;
    this.nombre = nombre;
    this.apellido = apellido;
    this.correo = correo;
    this.telefono = telefono;
    this.coordinates = coordinates;
    this.password = password;
    this.emailValidated = emailValidated;
    this.rol = rol;
    this.parkings = parkings;
    this.nacimiento = nacimiento;
    this.img = img;
    this.estado = estado;
    this.google = google;
    this.allowedApps = allowedApps;
    this.appPermissions = appPermissions;
  }

  static fromObject(object: Record<string, unknown>): UsuarioEntity {
    const {
      _id,
      id,
      nombre,
      apellido,
      correo,
      telefono,
      coordinates,
      password,
      emailValidated,
      rol,
      parkings,
      nacimiento,
      img,
      estado,
      google,
      allowedApps,
      appPermissions,
    } = object;

    const usuarioId = id || (_id ? String(_id) : undefined);

    if (!usuarioId) {
      throw CustomError.badRequest("Missing id");
    }

    if (!nombre) {
      throw CustomError.badRequest("Missing nombre");
    }

    if (!apellido) {
      throw CustomError.badRequest("Missing apellido");
    }

    if (!correo) {
      throw CustomError.badRequest("Missing correo");
    }

    if (!telefono) {
      throw CustomError.badRequest("Missing telefono");
    }

    if (!password) {
      throw CustomError.badRequest("Missing password");
    }

    if (!rol) {
      throw CustomError.badRequest("Missing rol");
    }

    if (estado === undefined || estado === null) {
      throw CustomError.badRequest("Missing estado");
    }

    if (google === undefined || google === null) {
      throw CustomError.badRequest("Missing google");
    }

    if (!isUsuarioRol(rol)) {
      throw CustomError.badRequest("Invalid rol");
    }

    const normalizedAllowedApps = normalizeUserApps(allowedApps);

    return new UsuarioEntity({
      id: String(usuarioId),
      nombre: String(nombre).trim(),
      apellido: String(apellido).trim(),
      correo: String(correo).trim().toLowerCase(),
      telefono: String(telefono).trim(),
      coordinates: Array.isArray(coordinates)
        ? coordinates.map((value) => Number(value))
        : undefined,
      password: String(password),
      emailValidated: emailValidated === true,
      rol,
      parkings: normalizeUserParkings(parkings),
      nacimiento:
        typeof nacimiento === "number"
          ? nacimiento
          : nacimiento
            ? Number(nacimiento)
            : undefined,
      img: typeof img === "string" ? img : undefined,
      estado: Boolean(estado),
      google: Boolean(google),
      allowedApps: normalizedAllowedApps,
      appPermissions: normalizeUserAppPermissions(
        appPermissions,
        normalizedAllowedApps,
      ),
    });
  }
}
