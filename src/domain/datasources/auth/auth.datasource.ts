import { UsuarioEntity } from "../../entities/auth/usuario.entity";

export abstract class AuthDatasource {
  abstract register(user: Omit<UsuarioEntity, "id">): Promise<UsuarioEntity>;
  abstract findByCorreo(correo: string): Promise<UsuarioEntity | null>;
  abstract findByTelefono(telefono: string): Promise<UsuarioEntity | null>;
  abstract findById(id: string): Promise<UsuarioEntity | null>;
  abstract updatePassword(
    id: string,
    password: string,
  ): Promise<UsuarioEntity | null>;
  abstract savePasswordResetToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void>;

  abstract getUserByPasswordResetToken(
    tokenHash: string,
  ): Promise<UsuarioEntity | null>;

  abstract resetPassword(userId: string, passwordHash: string): Promise<void>;
}
