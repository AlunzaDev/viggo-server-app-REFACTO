import {
  AUTH_ROLES,
  isUsuarioRol,
  normalizeUserParkings,
  normalizeUserModules,
  type UserModuleAccess,
  UsuarioRol,
} from "../../constants";

export class CreateUsuarioDto {
  private constructor(
    public readonly nombre: string,
    public readonly apellido: string,
    public readonly correo: string,
    public readonly telefono: string,
    public readonly password: string,
    public readonly rol: UsuarioRol,
    public readonly parkings: string[],
    public readonly modules: UserModuleAccess[],
    public readonly coordinates?: number[],
    public readonly nacimiento?: number,
    public readonly img?: string,
    public readonly estado: boolean = true,
    public readonly google: boolean = false,
    public readonly emailValidated: boolean = false,
  ) {}

  static create(body: Record<string, unknown>): [string?, CreateUsuarioDto?] {
    const nombre = typeof body.nombre === "string" ? body.nombre.trim() : "";
    const apellido =
      typeof body.apellido === "string" ? body.apellido.trim() : "";
    const correo =
      typeof body.correo === "string" ? body.correo.trim().toLowerCase() : "";
    const telefono =
      typeof body.telefono === "string" ? body.telefono.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const rol =
      body.rol === undefined
        ? AUTH_ROLES.CLIENT
        : isUsuarioRol(body.rol)
          ? body.rol
          : null;

    const coordinates = Array.isArray(body.coordinates)
      ? body.coordinates.map((value) => Number(value))
      : undefined;
    const parkings = normalizeUserParkings(body.parkings);
    const modules = normalizeUserModules(body.modules);

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

    const estado = typeof body.estado === "boolean" ? body.estado : true;
    const google = typeof body.google === "boolean" ? body.google : false;
    const emailValidated =
      typeof body.emailValidated === "boolean" ? body.emailValidated : false;

    if (!nombre) return ["'nombre' es requerido"];
    if (!apellido) return ["'apellido' es requerido"];
    if (!correo) return ["'correo' es requerido"];
    if (!telefono) return ["'telefono' es requerido"];
    if (!password) return ["'password' es requerido"];
    if (password.length < 6) {
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
      new CreateUsuarioDto(
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
        estado,
        google,
        emailValidated,
      ),
    ];
  }
}
