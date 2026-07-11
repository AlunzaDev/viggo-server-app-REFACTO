import { UsuarioModel } from "../../../data/mongo/models/auth/usuario.schema";
import { AuthDatasource } from "../../../domain/datasources/auth/auth.datasource";
import { UsuarioEntity } from "../../../domain/entities/auth/usuario.entity";

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
}