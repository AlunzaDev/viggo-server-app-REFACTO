export class LoginTelefonoDto {
  private constructor(
    public readonly telefono: string,
    public readonly password: string,
  ) {}

  static create(body: Record<string, unknown>): [string?, LoginTelefonoDto?] {
    const telefono =
      typeof body.telefono === "string" ? body.telefono.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!telefono) return ["'telefono' es requerido"];
    if (!password) return ["'password' es requerido"];

    return [undefined, new LoginTelefonoDto(telefono, password)];
  }
}
