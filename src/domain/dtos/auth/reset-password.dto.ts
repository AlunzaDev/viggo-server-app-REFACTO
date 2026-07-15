export class ResetPasswordDto {
  private constructor(
    public readonly token: string,
    public readonly newPassword: string,
  ) {}

  static create(obj: Record<string, unknown>): [string?, ResetPasswordDto?] {
    const token = typeof obj.token === "string" ? obj.token.trim() : "";
    const newPassword =
      typeof obj.newPassword === "string" ? obj.newPassword : "";
    const confirmPassword =
      typeof obj.confirmPassword === "string" ? obj.confirmPassword : undefined;

    if (!token) return ["'token' es requerido"];
    if (!newPassword) return ["'newPassword' es requerido"];
    if (newPassword.length < 6) {
      return ["'newPassword' debe tener al menos 6 caracteres"];
    }

    if (confirmPassword !== undefined && confirmPassword !== newPassword) {
      return ["Las contraseñas no coinciden"];
    }

    return [undefined, new ResetPasswordDto(token, newPassword)];
  }
}
