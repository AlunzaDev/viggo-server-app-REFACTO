import { UsuarioEntity } from "../../entities/auth/usuario.entity";

export abstract class UsuarioRepository {
  abstract findById(id: string): Promise<UsuarioEntity | null>;
  abstract findByCorreo(correo: string): Promise<UsuarioEntity | null>;
  abstract findByTelefono(telefono: string): Promise<UsuarioEntity | null>;
  abstract getAll(): Promise<UsuarioEntity[]>;
  abstract update(
    id: string,
    usuario: Partial<Omit<UsuarioEntity, "id">>,
  ): Promise<UsuarioEntity | null>;
  abstract delete(id: string): Promise<UsuarioEntity | null>;
}
