import { UsuarioEntity } from "../../entities/auth/usuario.entity";

export abstract class AuthRepository {
  abstract register(user: Omit<UsuarioEntity, "id">): Promise<UsuarioEntity>;
  abstract findByCorreo(correo: string): Promise<UsuarioEntity | null>;
  abstract findByTelefono(telefono: string): Promise<UsuarioEntity | null>;
  abstract findById(id: string): Promise<UsuarioEntity | null>;
}
