import { AuthDatasource } from "../../../domain/datasources/auth/auth.datasource";
import { UsuarioEntity } from "../../../domain/entities/auth/usuario.entity";
import { AuthRepository } from "../../../domain/repository/auth/auth.repository";

export class AuthRepositoryImpl implements AuthRepository {
  constructor(private readonly authDatasource: AuthDatasource) {}

  register(user: Omit<UsuarioEntity, "id">): Promise<UsuarioEntity> {
    return this.authDatasource.register(user);
  }

  findByCorreo(correo: string): Promise<UsuarioEntity | null> {
    return this.authDatasource.findByCorreo(correo);
  }

  findByTelefono(telefono: string): Promise<UsuarioEntity | null> {
    return this.authDatasource.findByTelefono(telefono);
  }

  findById(id: string): Promise<UsuarioEntity | null> {
    return this.authDatasource.findById(id);
  }

  updatePassword(id: string, password: string): Promise<UsuarioEntity | null> {
    return this.authDatasource.updatePassword(id, password);
  }
  savePasswordResetToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    return this.authDatasource.savePasswordResetToken(
      userId,
      tokenHash,
      expiresAt,
    );
  }

  getUserByPasswordResetToken(
    tokenHash: string,
  ): Promise<UsuarioEntity | null> {
    return this.authDatasource.getUserByPasswordResetToken(tokenHash);
  }

  resetPassword(userId: string, passwordHash: string): Promise<void> {
    return this.authDatasource.resetPassword(userId, passwordHash);
  }

  saveEmailValidationToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    return this.authDatasource.saveEmailValidationToken(
      userId,
      tokenHash,
      expiresAt,
    );
  }

  getUserByEmailValidationToken(
    tokenHash: string,
  ): Promise<UsuarioEntity | null> {
    return this.authDatasource.getUserByEmailValidationToken(tokenHash);
  }

  consumeEmailValidationToken(userId: string): Promise<UsuarioEntity> {
    return this.authDatasource.consumeEmailValidationToken(userId);
  }
}
