export class ResendValidationEmailDto {
  private constructor(public readonly correo: string) {}

  static create(
    body: Record<string, unknown>,
  ): [string?, ResendValidationEmailDto?] {
    const correo =
      typeof body.correo === "string" ? body.correo.trim().toLowerCase() : "";

    if (!correo) return ["'correo' es requerido"];

    return [undefined, new ResendValidationEmailDto(correo)];
  }
}
