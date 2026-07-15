import { UsuarioModel } from "../../../data/mongo/models/auth/usuario.schema";
import { AuthDatasource } from "../../../domain/datasources/auth/auth.datasource";
import { UsuarioEntity } from "../../../domain/entities/auth/usuario.entity";
import { CustomError } from "../../../domain/errors/custom.error";

export class AuthMongoDatasource extends AuthDatasource {
  async register(user: Omit<UsuarioEntity, "id">): Promise<UsuarioEntity> {
    const userDocument = await UsuarioModel.create(user);
    return UsuarioEntity.fromObject(userDocument.toObject());
  }

  async findByCorreo(correo: string): Promise<UsuarioEntity | null> {
    const userDocument = await UsuarioModel.findOne({ correo });
    if (!userDocument) return null;

    return UsuarioEntity.fromObject(userDocument.toObject());
  }

  async findByTelefono(telefono: string): Promise<UsuarioEntity | null> {
    const userDocument = await UsuarioModel.findOne({ telefono });
    if (!userDocument) return null;

    return UsuarioEntity.fromObject(userDocument.toObject());
  }

  async findById(id: string): Promise<UsuarioEntity | null> {
    const userDocument = await UsuarioModel.findById(id);
    if (!userDocument) return null;

    return UsuarioEntity.fromObject(userDocument.toObject());
  }

  async updatePassword(
    id: string,
    password: string,
  ): Promise<UsuarioEntity | null> {
    const userDocument = await UsuarioModel.findByIdAndUpdate(
      id,
      { password },
      { new: true },
    );
    if (!userDocument) return null;

    return UsuarioEntity.fromObject(userDocument.toObject());
  }

  async savePasswordResetToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    const result = await UsuarioModel.updateOne(
      { _id: userId },
      {
        $set: {
          passwordResetToken: tokenHash,
          passwordResetExpiresAt: expiresAt,
        },
      },
    );

    if (!result.matchedCount) {
      throw CustomError.notFound("Usuario no encontrado");
    }
  }

  async getUserByPasswordResetToken(
    tokenHash: string,
  ): Promise<UsuarioEntity | null> {
    const userDocument = await UsuarioModel.findOne({
      passwordResetToken: tokenHash,
      passwordResetExpiresAt: { $gt: new Date() },
    });

    if (!userDocument) return null;

    return UsuarioEntity.fromObject(userDocument.toObject());
  }

  async resetPassword(userId: string, passwordHash: string): Promise<void> {
    const result = await UsuarioModel.updateOne(
      { _id: userId },
      {
        $set: { password: passwordHash },
        $unset: {
          passwordResetToken: 1,
          passwordResetExpiresAt: 1,
        },
      },
    );

    if (!result.matchedCount) {
      throw CustomError.notFound("Usuario no encontrado");
    }
  }

  async saveEmailValidationToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    const result = await UsuarioModel.updateOne(
      { _id: userId },
      {
        $set: {
          emailValidationToken: tokenHash,
          emailValidationExpiresAt: expiresAt,
          emailValidated: false,
        },
      },
    );

    if (!result.matchedCount) {
      throw CustomError.notFound("Usuario no encontrado");
    }
  }

  async getUserByEmailValidationToken(
    tokenHash: string,
  ): Promise<UsuarioEntity | null> {
    const userDocument = await UsuarioModel.findOne({
      emailValidationToken: tokenHash,
      emailValidationExpiresAt: { $gt: new Date() },
      emailValidated: false,
    });

    if (!userDocument) return null;

    return UsuarioEntity.fromObject(userDocument.toObject());
  }

  async consumeEmailValidationToken(userId: string): Promise<UsuarioEntity> {
    const userDocument = await UsuarioModel.findOneAndUpdate(
      {
        _id: userId,
        emailValidated: false,
      },
      {
        $set: { emailValidated: true },
        $unset: {
          emailValidationToken: 1,
          emailValidationExpiresAt: 1,
        },
      },
      { new: true },
    );

    if (!userDocument) {
      throw CustomError.unauthorized("Token inválido, expirado o ya utilizado");
    }

    return UsuarioEntity.fromObject(userDocument.toObject());
  }
}
