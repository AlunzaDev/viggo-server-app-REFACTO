import {
  isUsuarioRol,
  normalizeUserParkings,
  normalizeUserModules,
  type UserModuleAccess,
  UsuarioRol,
} from "../../constants";

export class UpdateUsuarioDto {
  private constructor(
    public readonly nombre?: string,
    public readonly apellido?: string,
    public readonly correo?: string,
    public readonly telefono?: string,
    public readonly password?: string,
    public readonly rol?: UsuarioRol,
    public readonly parkings?: string[],
    public readonly modules?: UserModuleAccess[],
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
    const rol = body.rol === undefined ? undefined : isUsuarioRol(body.rol) ? body.rol : null;
    const parkings =
      body.parkings === undefined ? undefined : normalizeUserParkings(body.parkings);
    const modules =
      body.modules === undefined ? undefined : normalizeUserModules(body.modules);

    const coordinates = Array.isArray(body.coordinates)
      ? body.coordinates.map((value) => Number(value))
      : undefined;

    const nacimiento =
      typeof body.nacimiento === "number"
        ? body.nacimiento
        : body.nacimiento
          ? Number(body.nacimiento)
          : undefined;

    const img =
      typeof body.img === "string" && body.img.trim().length > 0
        ? body.img.trim()
        : undefined;

    const google = typeof body.google === "boolean" ? body.google : undefined;

    if (nombre !== undefined && !nombre) return ["'nombre' no puede ir vacío"];
    if (apellido !== undefined && !apellido) {
      return ["'apellido' no puede ir vacío"];
    }
    if (correo !== undefined && !correo) return ["'correo' no puede ir vacío"];
    if (telefono !== undefined && !telefono) {
      return ["'telefono' no puede ir vacío"];
    }
    if (password !== undefined && password.length < 6) {
      return ["'password' debe tener al menos 6 caracteres"];
    }
    if (rol === null) return ["'rol' no es válido"];
    if (coordinates?.some((value) => Number.isNaN(value))) {
      return ["'coordinates' debe contener solo números"];
    }
    if (nacimiento !== undefined && Number.isNaN(nacimiento)) {
      return ["'nacimiento' debe ser numérico"];
    }

    return [
      undefined,
      new UpdateUsuarioDto(
        nombre,
        apellido,
        correo,
        telefono,
        password,
        rol,
        parkings,
        modules,
        coordinates,
        nacimiento,
        img,
        google,
      ),
    ];
  }
}
