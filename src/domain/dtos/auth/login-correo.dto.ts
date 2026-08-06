import { isUserAppAccess, type UserAppAccess } from "../../constants";

export class LoginCorreoDto {
  private constructor(
    public readonly correo: string,
    public readonly password: string,
    public readonly app: UserAppAccess,
  ) {}

  static create(object: Record<string, unknown>): [string?, LoginCorreoDto?] {
    const correo = String(object.correo ?? "")
      .trim()
      .toLowerCase();

    const password = String(object.password ?? "");
    const app = object.app;

    if (!correo) {
      return ["El correo es obligatorio"];
    }

    if (!password) {
      return ["La contraseña es obligatoria"];
    }

    if (!isUserAppAccess(app)) {
      return ["La aplicación no es válida"];
    }

    return [undefined, new LoginCorreoDto(correo, password, app)];
  }
}
