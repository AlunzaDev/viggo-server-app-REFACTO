import {
  AUTH_ROLES,
  type UserModuleAccess,
  type UsuarioRol,
} from "../../constants";

export class RegisterUserDto {
  private constructor(
    public readonly nombre: string,
    public readonly apellido: string,
    public readonly correo: string,
    public readonly telefono: string,
    public readonly password: string,

    // Estos valores los controla exclusivamente el backend.
    public readonly rol: UsuarioRol,
    public readonly parkings: string[],
    public readonly modules: UserModuleAccess[],
    public readonly estado: boolean,
    public readonly google: boolean,
  ) {}

  static create(
    body: Record<string, unknown>,
  ): [string?, RegisterUserDto?] {
    const nombre =
      typeof body.nombre === "string"
        ? body.nombre.trim()
        : "";

    const apellido =
      typeof body.apellido === "string"
        ? body.apellido.trim()
        : "";

    const correo =
      typeof body.correo === "string"
        ? body.correo.trim().toLowerCase()
        : "";

    const telefono =
      typeof body.telefono === "string"
        ? body.telefono.trim()
        : "";

    const password =
      typeof body.password === "string"
        ? body.password
        : "";

    if (!nombre) {
      return ["'nombre' es requerido"];
    }

    if (!apellido) {
      return ["'apellido' es requerido"];
    }

    if (!correo) {
      return ["'correo' es requerido"];
    }

    if (!telefono) {
      return ["'telefono' es requerido"];
    }

    if (!password) {
      return ["'password' es requerido"];
    }

    if (password.length < 6) {
      return [
        "'password' debe tener al menos 6 caracteres",
      ];
    }

    return [
      undefined,
      new RegisterUserDto(
        nombre,
        apellido,
        correo,
        telefono,
        password,
        AUTH_ROLES.CLIENT,
        [],
        [],
        true,
        false,
      ),
    ];
  }
}