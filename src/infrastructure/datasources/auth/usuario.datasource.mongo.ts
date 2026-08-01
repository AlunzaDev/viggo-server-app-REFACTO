import { UsuarioModel } from "../../../data/mongo/models/auth/usuario.schema";
import { UsuarioDatasource } from "../../../domain/datasources/auth/usuario.datasource";
import { UsuarioEntity } from "../../../domain/entities/auth/usuario.entity";
import { deleteManagedUserImage } from "../../../presentation/utils/user-image.util";

export class UsuarioMongoDatasource extends UsuarioDatasource {
  async create(usuario: Omit<UsuarioEntity, "id">): Promise<UsuarioEntity> {
    try {
      const usuarioDocument = await UsuarioModel.create(usuario);
      return UsuarioEntity.fromObject(usuarioDocument.toObject());
    } catch (error) {
      deleteManagedUserImage(usuario.img);
      throw error;
    }
  }

  async findById(id: string): Promise<UsuarioEntity | null> {
    const usuarioDocument = await UsuarioModel.findById(id);
    if (!usuarioDocument) return null;

    return UsuarioEntity.fromObject(usuarioDocument.toObject());
  }

  async findByCorreo(correo: string): Promise<UsuarioEntity | null> {
    const usuarioDocument = await UsuarioModel.findOne({ correo });
    if (!usuarioDocument) return null;

    return UsuarioEntity.fromObject(usuarioDocument.toObject());
  }

  async findByTelefono(telefono: string): Promise<UsuarioEntity | null> {
    const usuarioDocument = await UsuarioModel.findOne({ telefono });
    if (!usuarioDocument) return null;

    return UsuarioEntity.fromObject(usuarioDocument.toObject());
  }

  async getAll(): Promise<UsuarioEntity[]> {
    const usuarios = await UsuarioModel.find();
    return usuarios.map((usuario) =>
      UsuarioEntity.fromObject(usuario.toObject()),
    );
  }

  async update(
    id: string,
    usuario: Partial<Omit<UsuarioEntity, "id">>,
  ): Promise<UsuarioEntity | null> {
    const existingUser = await UsuarioModel.findById(id);
    if (!existingUser) {
      deleteManagedUserImage(usuario.img);
      return null;
    }

    const previousImage = String(existingUser.img ?? "").trim();
    const nextImage =
      typeof usuario.img === "string" ? usuario.img.trim() : undefined;

    try {
      const usuarioDocument = await UsuarioModel.findByIdAndUpdate(id, usuario, {
        new: true,
      });

      if (!usuarioDocument) return null;

      if (nextImage !== undefined && nextImage !== previousImage) {
        deleteManagedUserImage(previousImage);
      }

      return UsuarioEntity.fromObject(usuarioDocument.toObject());
    } catch (error) {
      if (nextImage && nextImage !== previousImage) {
        deleteManagedUserImage(nextImage);
      }
      throw error;
    }
  }

  async delete(id: string): Promise<UsuarioEntity | null> {
    const usuarioDocument = await UsuarioModel.findByIdAndDelete(id);

    if (!usuarioDocument) return null;

    deleteManagedUserImage(String(usuarioDocument.img ?? ""));

    return UsuarioEntity.fromObject(usuarioDocument.toObject());
  }
}
