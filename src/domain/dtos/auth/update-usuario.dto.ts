import {
  isUserAppAccess,
  isUsuarioRol,
  normalizeUserApps,
  normalizeUserParkings,
  type UserAppAccess,
  type UsuarioRol,
} from "../../constants";
import type { UserAppPermission } from "../../entities/auth/usuario.entity";

const parseAppPermissions = (
  value: unknown,
): [string?, UserAppPermission[]?] => {
  if (!Array.isArray(value)) {
    return ["'appPermissions' debe ser un arreglo"];
  }

  const permissions: UserAppPermission[] = [];
  const assignedApps = new Set<UserAppAccess>();

  for (const item of value) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      return ["'appPermissions' contiene asignaciones no válidas"];
    }

    const permission = item as Record<string, unknown>;
    const app = permission.app;

    const permissionProfileId =
      typeof permission.permissionProfileId === "string"
        ? permission.permissionProfileId.trim()
        : "";

    if (!isUserAppAccess(app) || !permissionProfileId) {
      return ["'appPermissions' contiene asignaciones no válidas"];
    }

    if (assignedApps.has(app)) {
      return ["'appPermissions' solo permite un perfil por aplicación"];
    }

    assignedApps.add(app);
    permissions.push({
      app,
      permissionProfileId,
    });
  }

  return [undefined, permissions];
};

export class UpdateUsuarioDto {
  private constructor(
    public readonly nombre?: string,
    public readonly apellido?: string,
    public readonly correo?: string,
    public readonly telefono?: string,
    public readonly password?: string,
    public readonly rol?: UsuarioRol,
    public readonly parkings?: string[],
    public readonly allowedApps?: UserAppAccess[],
    public readonly appPermissions?: UserAppPermission[],
    public readonly coordinates?: number[],
    public readonly nacimiento?: number,
    public readonly img?: string,
    public readonly google?: boolean,
  ) {}

  static create(body: Record<string, unknown>): [string?, UpdateUsuarioDto?] {
    const nombre =
      typeof body.nombre === "string" ? body.nombre.trim() : undefined;

    const apellido =
      typeof body.apellido === "string" ? body.apellido.trim() : undefined;

    const correo =
      typeof body.correo === "string"
        ? body.correo.trim().toLowerCase()
        : undefined;

    const telefono =
      typeof body.telefono === "string" ? body.telefono.trim() : undefined;

    const password =
      typeof body.password === "string" ? body.password : undefined;

    const rol =
      body.rol === undefined
        ? undefined
        : isUsuarioRol(body.rol)
          ? body.rol
          : null;

    const parkings =
      body.parkings === undefined
        ? undefined
        : normalizeUserParkings(body.parkings);

    const allowedApps =
      body.allowedApps === undefined
        ? undefined
        : normalizeUserApps(body.allowedApps);

    let appPermissions: UserAppPermission[] | undefined;

    if (body.appPermissions !== undefined) {
      const [appPermissionsError, parsedAppPermissions] = parseAppPermissions(
        body.appPermissions,
      );

      if (appPermissionsError) {
        return [appPermissionsError];
      }

      appPermissions = parsedAppPermissions;
    }

    const coordinates =
      body.coordinates === undefined
        ? undefined
        : Array.isArray(body.coordinates)
          ? body.coordinates.map((value) => Number(value))
          : [];

    const nacimiento =
      body.nacimiento === undefined
        ? undefined
        : typeof body.nacimiento === "number"
          ? body.nacimiento
          : Number(body.nacimiento);

    const img =
      body.img === undefined
        ? undefined
        : typeof body.img === "string"
          ? body.img.trim()
          : undefined;

    const google = typeof body.google === "boolean" ? body.google : undefined;

    if (nombre !== undefined && !nombre) {
      return ["'nombre' no puede ir vacío"];
    }

    if (apellido !== undefined && !apellido) {
      return ["'apellido' no puede ir vacío"];
    }

    if (correo !== undefined && !correo) {
      return ["'correo' no puede ir vacío"];
    }

    if (telefono !== undefined && !telefono) {
      return ["'telefono' no puede ir vacío"];
    }

    if (password !== undefined && password.length < 6) {
      return ["'password' debe tener al menos 6 caracteres"];
    }

    if (rol === null) {
      return ["'rol' no es válido"];
    }

    if (
      body.allowedApps !== undefined &&
      (!Array.isArray(body.allowedApps) ||
        !body.allowedApps.every(isUserAppAccess))
    ) {
      return ["'allowedApps' contiene aplicaciones no válidas"];
    }

    if (body.coordinates !== undefined && !Array.isArray(body.coordinates)) {
      return ["'coordinates' debe ser un arreglo"];
    }

    if (coordinates?.some((value) => Number.isNaN(value))) {
      return ["'coordinates' debe contener solo números"];
    }

    if (nacimiento !== undefined && Number.isNaN(nacimiento)) {
      return ["'nacimiento' debe ser numérico"];
    }

    if (body.img !== undefined && typeof body.img !== "string") {
      return ["'img' debe ser texto"];
    }

    if (allowedApps && appPermissions) {
      const hasPermissionOutsideAllowedApps = appPermissions.some(
        (permission) => !allowedApps.includes(permission.app),
      );

      if (hasPermissionOutsideAllowedApps) {
        return [
          "Cada asignación de permisos debe corresponder a una aplicación incluida en 'allowedApps'",
        ];
      }
    }

    const dto = new UpdateUsuarioDto(
      nombre,
      apellido,
      correo,
      telefono,
      password,
      rol ?? undefined,
      parkings,
      allowedApps,
      appPermissions,
      coordinates,
      nacimiento,
      img,
      google,
    );

    if (Object.values(dto).every((value) => value === undefined)) {
      return ["Debes enviar al menos un campo para actualizar"];
    }

    return [undefined, dto];
  }
}
