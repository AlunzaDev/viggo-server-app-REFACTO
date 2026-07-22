import { PermissionProfileEntity } from "../../../domain/entities/auth/permission-profile.entity";
import { CustomError } from "../../../domain/errors/custom.error";
import { PermissionProfileRepository } from "../../../domain/repository/auth/permission-profile.repository";
import { UsuarioRepository } from "../../../domain/repository/auth/usuario.repository";

export class PermissionProfileService {
  constructor(
    private readonly repository: PermissionProfileRepository,
    private readonly usuarioRepository: UsuarioRepository,
  ) {}

  async createProfile(
    profile: Omit<PermissionProfileEntity, "id">,
  ): Promise<PermissionProfileEntity> {
    await this.validateUniqueName(undefined, profile.nombre);
    return this.repository.create(profile);
  }

  async getProfiles(): Promise<PermissionProfileEntity[]> {
    return this.repository.getAll();
  }

  async getProfileById(id: string): Promise<PermissionProfileEntity> {
    const profile = await this.repository.findById(id);
    if (!profile) throw CustomError.notFound("Perfil de permisos no encontrado");
    return profile;
  }

  async updateProfile(
    id: string,
    profile: Partial<Omit<PermissionProfileEntity, "id">>,
  ): Promise<PermissionProfileEntity> {
    if (profile.nombre) {
      await this.validateUniqueName(id, profile.nombre);
    }
    const updated = await this.repository.update(id, profile);
    if (!updated) throw CustomError.notFound("Perfil de permisos no encontrado");
    return updated;
  }

  async deleteProfile(id: string): Promise<PermissionProfileEntity> {
    const usuarios = await this.usuarioRepository.getAll();
    if (usuarios.some((usuario) => usuario.permissionProfileId === id)) {
      throw CustomError.badRequest(
        "No se puede eliminar el perfil porque hay usuarios asignados a el",
      );
    }

    const deleted = await this.repository.delete(id);
    if (!deleted) throw CustomError.notFound("Perfil de permisos no encontrado");
    return deleted;
  }

  private async validateUniqueName(id: string | undefined, nombre: string) {
    const existing = await this.repository.findByNombre(nombre);
    if (existing && existing.id !== id) {
      throw CustomError.badRequest("Ya existe un perfil con ese nombre");
    }
  }
}
