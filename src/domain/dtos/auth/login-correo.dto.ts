export class LoginCorreoDto {
  private constructor(
    public readonly correo: string,
    public readonly password: string,
  ) {}

  static create(body: Record<string, unknown>): [string?, LoginCorreoDto?] {
    const correo =
      typeof body.correo === "string" ? body.correo.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!correo) return ["'correo' es requerido"];
    if (!password) return ["'password' es requerido"];

    return [undefined, new LoginCorreoDto(correo, password)];
  }
}
