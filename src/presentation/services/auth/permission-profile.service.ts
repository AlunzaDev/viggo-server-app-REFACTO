import {
  getInvalidUserModulesForApp,
  type UserAppAccess,
  type UserModuleAccess,
} from "../../../domain/constants";
import { PermissionProfileEntity } from "../../../domain/entities/auth/permission-profile.entity";
import { CustomError } from "../../../domain/errors/custom.error";
import { PermissionProfileRepository } from "../../../domain/repositories/auth/permission-profile.repository";
import { UsuarioRepository } from "../../../domain/repositories/auth/usuario.repository";

export class PermissionProfileService {
  constructor(
    private readonly repository: PermissionProfileRepository,
    private readonly usuarioRepository: UsuarioRepository,
  ) {}

  async createProfile(
    profile: Omit<PermissionProfileEntity, "id">,
  ): Promise<PermissionProfileEntity> {
    this.validateModulesForApp(profile.app, profile.modules);

    await this.validateUniqueName(undefined, profile.app, profile.nombre);

    return this.repository.create(profile);
  }

  async getProfiles(app?: UserAppAccess): Promise<PermissionProfileEntity[]> {
    return this.repository.getAll(app);
  }

  async getProfileById(id: string): Promise<PermissionProfileEntity> {
    const profile = await this.repository.findById(id);

    if (!profile) {
      throw CustomError.notFound("Perfil de permisos no encontrado");
    }

    return profile;
  }

  async updateProfile(
    id: string,
    profile: Partial<Omit<PermissionProfileEntity, "id" | "app">>,
  ): Promise<PermissionProfileEntity> {
    const currentProfile = await this.repository.findById(id);

    if (!currentProfile) {
      throw CustomError.notFound("Perfil de permisos no encontrado");
    }

    if (profile.nombre) {
      await this.validateUniqueName(id, currentProfile.app, profile.nombre);
    }

    if (profile.modules !== undefined) {
      this.validateModulesForApp(currentProfile.app, profile.modules);
    }

    const updated = await this.repository.update(id, profile);

    if (!updated) {
      throw CustomError.notFound("Perfil de permisos no encontrado");
    }

    return updated;
  }

  async deleteProfile(id: string): Promise<PermissionProfileEntity> {
    const profile = await this.repository.findById(id);

    if (!profile) {
      throw CustomError.notFound("Perfil de permisos no encontrado");
    }

    const usuarios = await this.usuarioRepository.getAll();

    const profileIsAssigned = usuarios.some(
      (usuario) =>
        usuario.appPermissions.some(
          (permission) => permission.permissionProfileId === id,
        ),
    );

    if (profileIsAssigned) {
      throw CustomError.badRequest(
        "No se puede eliminar el perfil porque hay usuarios asignados a él",
      );
    }

    const deleted = await this.repository.delete(id);

    if (!deleted) {
      throw CustomError.notFound("Perfil de permisos no encontrado");
    }

    return deleted;
  }

  private validateModulesForApp(
    app: UserAppAccess,
    modules: UserModuleAccess[],
  ): void {
    if (modules.length === 0) {
      throw CustomError.badRequest("El perfil debe incluir al menos un módulo");
    }

    const invalidModules = getInvalidUserModulesForApp(modules, app);

    if (invalidModules.length > 0) {
      throw CustomError.badRequest(
        `Los siguientes módulos no pertenecen a ${app}: ${invalidModules.join(", ")}`,
      );
    }
  }

  private async validateUniqueName(
    id: string | undefined,
    app: UserAppAccess,
    nombre: string,
  ): Promise<void> {
    const existing = await this.repository.findByNombre(app, nombre);

    if (existing && existing.id !== id) {
      throw CustomError.badRequest(
        "Ya existe un perfil con ese nombre para la aplicación seleccionada",
      );
    }
  }
}
