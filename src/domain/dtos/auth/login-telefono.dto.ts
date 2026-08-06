import { isUserAppAccess, type UserAppAccess } from "../../constants";

export class LoginTelefonoDto {
  private constructor(
    public readonly telefono: string,
    public readonly password: string,
    public readonly app: UserAppAccess,
  ) {}

  static create(object: Record<string, unknown>): [string?, LoginTelefonoDto?] {
    const telefono = String(object.telefono ?? "").trim();
    const password = String(object.password ?? "");
    const app = object.app;

    if (!telefono) {
      return ["El teléfono es obligatorio"];
    }

    if (!password) {
      return ["La contraseña es obligatoria"];
    }

    if (!isUserAppAccess(app)) {
      return ["La aplicación no es válida"];
    }

    return [undefined, new LoginTelefonoDto(telefono, password, app)];
  }
}
