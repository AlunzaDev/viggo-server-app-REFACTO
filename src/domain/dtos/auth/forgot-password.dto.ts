export class ForgotPasswordDto {
  private constructor(public readonly correo: string) {}

  static create(obj: Record<string, unknown>): [string?, ForgotPasswordDto?] {
    const correo =
      typeof obj.correo === "string" ? obj.correo.trim().toLowerCase() : "";

    if (!correo) return ["'correo' es requerido"];

    return [undefined, new ForgotPasswordDto(correo)];
  }
}
