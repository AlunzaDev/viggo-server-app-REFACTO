import { bcryptPlugin } from "../../../config/plugins/bcrypt.plugin";
import { UsuarioEntity } from "../../../domain/entities/auth/usuario.entity";
import { CustomError } from "../../../domain/errors/custom.error";
import { UsuarioRepository } from "../../../domain/repository/auth/usuario.repository";

type SafeUsuario = Omit<UsuarioEntity, "password">;

export class UsuarioService {
  constructor(private readonly usuarioRepository: UsuarioRepository) {}

  async createUsuario(
    usuario: Omit<UsuarioEntity, "id">,
  ): Promise<SafeUsuario> {
    await this.validateUniqueFields(undefined, usuario);

    const hashedPassword = bcryptPlugin.hash(usuario.password);

    const usuarioCreated = await this.usuarioRepository.create({
      ...usuario,
      password: hashedPassword,
    });

    return this.toSafeUsuario(usuarioCreated);
  }

  async getUsuarios(): Promise<SafeUsuario[]> {
    const usuarios = await this.usuarioRepository.getAll();
    return usuarios.map((usuario) => this.toSafeUsuario(usuario));
  }

  async getUsuarioById(id: string): Promise<SafeUsuario> {
    const usuario = await this.usuarioRepository.findById(id);

    if (!usuario) {
      throw CustomError.notFound("Usuario no encontrado");
    }

    return this.toSafeUsuario(usuario);
  }

  async updateUsuario(
    id: string,
    usuario: Partial<Omit<UsuarioEntity, "id">>,
  ): Promise<SafeUsuario> {
    await this.validateUniqueFields(id, usuario);

    const usuarioToUpdate = {
      ...usuario,
      password: usuario.password
        ? bcryptPlugin.hash(usuario.password)
        : undefined,
    };

    if (!usuarioToUpdate.password) {
      delete usuarioToUpdate.password;
    }

    const usuarioUpdated = await this.usuarioRepository.update(
      id,
      usuarioToUpdate,
    );

    if (!usuarioUpdated) {
      throw CustomError.notFound("Usuario no encontrado");
    }

    return this.toSafeUsuario(usuarioUpdated);
  }

  async updateUsuarioStatus(id: string, estado: boolean): Promise<SafeUsuario> {
    const usuarioUpdated = await this.usuarioRepository.update(id, { estado });

    if (!usuarioUpdated) {
      throw CustomError.notFound("Usuario no encontrado");
    }

    return this.toSafeUsuario(usuarioUpdated);
  }

  async deleteUsuario(id: string): Promise<SafeUsuario> {
    const usuarioDeleted = await this.usuarioRepository.delete(id);

    if (!usuarioDeleted) {
      throw CustomError.notFound("Usuario no encontrado");
    }

    return this.toSafeUsuario(usuarioDeleted);
  }

  private async validateUniqueFields(
    id: string | undefined,
    usuario: Partial<Omit<UsuarioEntity, "id">>,
  ) {
    if (usuario.correo) {
      const userByCorreo = await this.usuarioRepository.findByCorreo(
        usuario.correo,
      );

      if (userByCorreo && userByCorreo.id !== id) {
        throw CustomError.badRequest("El correo ya esta registrado");
      }
    }

    if (usuario.telefono) {
      const userByTelefono = await this.usuarioRepository.findByTelefono(
        usuario.telefono,
      );

      if (userByTelefono && userByTelefono.id !== id) {
        throw CustomError.badRequest("El telefono ya esta registrado");
      }
    }
  }

  private toSafeUsuario(usuario: UsuarioEntity): SafeUsuario {
    const { password, ...safeUsuario } = usuario;
    return safeUsuario;
  }
}
