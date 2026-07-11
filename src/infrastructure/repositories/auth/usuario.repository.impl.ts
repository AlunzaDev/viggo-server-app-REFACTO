import { UsuarioDatasource } from "../../../domain/datasources/auth/usuario.datasource";
import { UsuarioEntity } from "../../../domain/entities/auth/usuario.entity";
import { UsuarioRepository } from "../../../domain/repository/auth/usuario.repository";

export class UsuarioRepositoryImpl implements UsuarioRepository {
  constructor(private readonly usuarioDatasource: UsuarioDatasource) {}

  findById(id: string): Promise<UsuarioEntity | null> {
    return this.usuarioDatasource.findById(id);
  }

  findByCorreo(correo: string): Promise<UsuarioEntity | null> {
    return this.usuarioDatasource.findByCorreo(correo);
  }

  findByTelefono(telefono: string): Promise<UsuarioEntity | null> {
    return this.usuarioDatasource.findByTelefono(telefono);
  }

  getAll(): Promise<UsuarioEntity[]> {
    return this.usuarioDatasource.getAll();
  }

  update(
    id: string,
    usuario: Partial<Omit<UsuarioEntity, "id">>,
  ): Promise<UsuarioEntity | null> {
    return this.usuarioDatasource.update(id, usuario);
  }

  delete(id: string): Promise<UsuarioEntity | null> {
    return this.usuarioDatasource.delete(id);
  }
}
