import { AUTH_ROLES, isUsuarioRol, UsuarioRol } from "../../constants";

export class RegisterUserDto {
  private constructor(
    public readonly nombre: string,
    public readonly apellido: string,
    public readonly correo: string,
    public readonly telefono: string,
    public readonly password: string,
    public readonly rol: UsuarioRol,
    public readonly coordinates?: number[],
    public readonly nacimiento?: number,
    public readonly img?: string,
    public readonly estado: boolean = true,
    public readonly google: boolean = false,
  ) {}

  static create(body: Record<string, unknown>): [string?, RegisterUserDto?] {
    const nombre = typeof body.nombre === "string" ? body.nombre.trim() : "";
    const apellido =
      typeof body.apellido === "string" ? body.apellido.trim() : "";
    const correo =
      typeof body.correo === "string" ? body.correo.trim().toLowerCase() : "";
    const telefono =
      typeof body.telefono === "string" ? body.telefono.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const rol = isUsuarioRol(body.rol) ? body.rol : AUTH_ROLES.CLIENT;

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

    const estado = typeof body.estado === "boolean" ? body.estado : true;

    const google = typeof body.google === "boolean" ? body.google : false;

    if (!nombre) return ["'nombre' es requerido"];
    if (!apellido) return ["'apellido' es requerido"];
    if (!correo) return ["'correo' es requerido"];
    if (!telefono) return ["'telefono' es requerido"];
    if (!password) return ["'password' es requerido"];
    if (password.length < 6) {
      return ["'password' debe tener al menos 6 caracteres"];
    }

    return [
      undefined,
      new RegisterUserDto(
        nombre,
        apellido,
        correo,
        telefono,
        password,
        rol,
        coordinates,
        nacimiento,
        img,
        estado,
        google,
      ),
    ];
  }
}
