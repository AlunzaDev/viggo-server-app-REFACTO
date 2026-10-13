import { PostgresDatabase } from "../../../data/postgres";
import { AuthDatasource } from "../../../domain/datasources/auth/auth.datasource";
import { UsuarioEntity } from "../../../domain/entities/auth/usuario.entity";
import { CustomError } from "../../../domain/errors/custom.error";
import { isUuid } from "../postgres/prisma-errors";
import { createUsuario, findUsuario } from "./usuario.datasource.postgres";
import { usuarioInclude, toUsuarioEntity } from "./usuario.prisma-mapper";

export class AuthPostgresDatasource extends AuthDatasource {
  private get usuarios() {
    return PostgresDatabase.client.usuario;
  }

  register(user: Omit<UsuarioEntity, "id">): Promise<UsuarioEntity> {
    return createUsuario(user);
  }

  findByCorreo(correo: string): Promise<UsuarioEntity | null> {
    return findUsuario({ correo: correo.trim().toLowerCase() });
  }

  findByTelefono(telefono: string): Promise<UsuarioEntity | null> {
    return findUsuario({ telefono });
  }

  findById(id: string): Promise<UsuarioEntity | null> {
    return isUuid(id) ? findUsuario({ id }) : Promise.resolve(null);
  }

  async updatePassword(id: string, password: string): Promise<UsuarioEntity | null> {
    if (!(await this.updateUsuario(id, { password }))) return null;
    return findUsuario({ id });
  }

  async savePasswordResetToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    const updated = await this.updateUsuario(userId, {
      passwordResetTokenHash: tokenHash,
      passwordResetExpiresAt: expiresAt,
    });
    if (!updated) throw CustomError.notFound("Usuario no encontrado");
  }

  async getUserByPasswordResetToken(tokenHash: string): Promise<UsuarioEntity | null> {
    const row = await this.usuarios.findFirst({
      where: { passwordResetTokenHash: tokenHash, passwordResetExpiresAt: { gt: new Date() } },
      include: usuarioInclude,
    });
    return row ? toUsuarioEntity(row) : null;
  }

  async resetPassword(userId: string, passwordHash: string): Promise<void> {
    const updated = await this.updateUsuario(userId, {
      password: passwordHash,
      passwordResetTokenHash: null,
      passwordResetExpiresAt: null,
    });
    if (!updated) throw CustomError.notFound("Usuario no encontrado");
  }

  async saveEmailValidationToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    const updated = await this.updateUsuario(userId, {
      emailValidationTokenHash: tokenHash,
      emailValidationExpiresAt: expiresAt,
      emailValidated: false,
    });
    if (!updated) throw CustomError.notFound("Usuario no encontrado");
  }

  async getUserByEmailValidationToken(tokenHash: string): Promise<UsuarioEntity | null> {
    const row = await this.usuarios.findFirst({
      where: {
        emailValidationTokenHash: tokenHash,
        emailValidationExpiresAt: { gt: new Date() },
        emailValidated: false,
      },
      include: usuarioInclude,
    });
    return row ? toUsuarioEntity(row) : null;
  }

  async consumeEmailValidationToken(userId: string): Promise<UsuarioEntity> {
    // Conditional update: only one request can consume the token.
    const { count } = isUuid(userId)
      ? await this.usuarios.updateMany({
          where: { id: userId, emailValidated: false },
          data: { emailValidated: true, emailValidationTokenHash: null, emailValidationExpiresAt: null },
        })
      : { count: 0 };

    const usuario = count ? await findUsuario({ id: userId }) : null;
    if (!usuario) throw CustomError.unauthorized("Token inválido, expirado o ya utilizado");
    return usuario;
  }

  /** Updates columns of an existing user; false if the user does not exist. */
  private async updateUsuario(
    id: string,
    data: Parameters<typeof PostgresDatabase.client.usuario.updateMany>[0]["data"],
  ): Promise<boolean> {
    if (!isUuid(id)) return false;
    const { count } = await this.usuarios.updateMany({ where: { id }, data });
    return count > 0;
  }
}
