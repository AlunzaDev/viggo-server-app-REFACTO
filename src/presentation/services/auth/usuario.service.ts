import { bcryptPlugin } from "../../../config/plugins/bcrypt.plugin";
import { AUTH_ROLES, USER_APPS } from "../../../domain/constants";
import {
  UsuarioEntity,
  type UserAppPermission,
} from "../../../domain/entities/auth/usuario.entity";
import { CustomError } from "../../../domain/errors/custom.error";
import { PermissionProfileRepository } from "../../../domain/repository/auth/permission-profile.repository";
import { UsuarioRepository } from "../../../domain/repository/auth/usuario.repository";
import { AuthService } from "./auth.service";

type SafeUsuario = Omit<UsuarioEntity, "password">;

type ResolvedAppAccess = Pick<UsuarioEntity, "allowedApps" | "appPermissions">;

export class UsuarioService {
  constructor(
    private readonly usuarioRepository: UsuarioRepository,
    private readonly permissionProfileRepository: PermissionProfileRepository,
    private readonly authService: AuthService,
  ) {}

  async createUsuario(
    usuario: Omit<UsuarioEntity, "id" | "emailValidated"> & {
      emailValidated?: boolean;
    },
  ): Promise<SafeUsuario> {
    await this.validateUniqueFields(undefined, usuario);
    this.validateProjectAssignments(usuario);

    const resolvedAppAccess = await this.resolveAppAccess(
      usuario.allowedApps,
      usuario.appPermissions,
    );

    const usuarioCreated = await this.usuarioRepository.create({
      ...usuario,
      ...resolvedAppAccess,
      emailValidated: usuario.emailValidated ?? false,
      password: bcryptPlugin.hash(usuario.password),
    });

    if (usuarioCreated.emailValidated !== true) {
      await this.authService.sendEmailValidationLink(
        usuarioCreated.id,
        usuarioCreated.correo,
      );
    }

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
    const currentUsuario = await this.usuarioRepository.findById(id);

    if (!currentUsuario) {
      throw CustomError.notFound("Usuario no encontrado");
    }

    await this.validateUniqueFields(id, usuario);

    this.validateProjectAssignments({
      ...currentUsuario,
      ...usuario,
    });

    const accessWasUpdated =
      usuario.allowedApps !== undefined || usuario.appPermissions !== undefined;

    const resolvedAppAccess = accessWasUpdated
      ? await this.resolveAppAccess(
          usuario.allowedApps ?? currentUsuario.allowedApps,
          usuario.appPermissions ?? currentUsuario.appPermissions,
        )
      : {};

    const usuarioToUpdate = {
      ...usuario,
      ...resolvedAppAccess,
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
    const usuarioUpdated = await this.usuarioRepository.update(id, {
      estado,
    });

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
  ): Promise<void> {
    if (usuario.correo) {
      const userByCorreo = await this.usuarioRepository.findByCorreo(
        usuario.correo,
      );

      if (userByCorreo && userByCorreo.id !== id) {
        throw CustomError.badRequest("El correo ya está registrado");
      }
    }

    if (usuario.telefono) {
      const userByTelefono = await this.usuarioRepository.findByTelefono(
        usuario.telefono,
      );

      if (userByTelefono && userByTelefono.id !== id) {
        throw CustomError.badRequest("El teléfono ya está registrado");
      }
    }
  }

  private validateProjectAssignments(
    usuario: Partial<Omit<UsuarioEntity, "id">>,
  ): void {
    if (!usuario.parkings) return;

    const assignedProjects = usuario.parkings.filter(Boolean);

    if (
      usuario.rol &&
      usuario.rol !== AUTH_ROLES.SUPER &&
      assignedProjects.length > 1
    ) {
      throw CustomError.badRequest(
        "Por ahora solo se permite un proyecto asignado para usuarios que no son super administrador",
      );
    }
  }

  private async resolveAppAccess(
    allowedApps: UsuarioEntity["allowedApps"],
    appPermissions: UserAppPermission[],
  ): Promise<ResolvedAppAccess> {
    const allowedAppSet = new Set(allowedApps);
    const assignedApps = new Set<string>();

    const validPermissions = appPermissions.filter((permission) =>
      allowedAppSet.has(permission.app),
    );

    if (validPermissions.length !== appPermissions.length) {
      throw CustomError.badRequest(
        "Cada perfil asignado debe corresponder a una aplicación permitida",
      );
    }

    const missingWebProfile = allowedApps.find(
      (app) =>
        app !== USER_APPS.OPERATIVE_MOBILE &&
        !validPermissions.some((permission) => permission.app === app),
    );

    if (missingWebProfile) {
      throw CustomError.badRequest(
        `La aplicación ${missingWebProfile} requiere un perfil de permisos`,
      );
    }

    const resolvedPermissions = await Promise.all(
      validPermissions.map(async (permission): Promise<UserAppPermission> => {
        if (assignedApps.has(permission.app)) {
          throw CustomError.badRequest(
            "Solo puede asignarse un perfil por aplicación",
          );
        }

        assignedApps.add(permission.app);

        const profile = await this.permissionProfileRepository.findById(
          permission.permissionProfileId,
        );

        if (!profile || !profile.estado) {
          throw CustomError.badRequest(
            "Uno de los perfiles de permisos seleccionados no existe o está inactivo",
          );
        }

        if (profile.app !== permission.app) {
          throw CustomError.badRequest(
            `El perfil '${profile.nombre}' no pertenece a la aplicación ${permission.app}`,
          );
        }

        return {
          app: permission.app,
          permissionProfileId: profile.id,
        };
      }),
    );

    return {
      allowedApps,
      appPermissions: resolvedPermissions,
    };
  }

  private toSafeUsuario(usuario: UsuarioEntity): SafeUsuario {
    const { password, ...safeUsuario } = usuario;

    return safeUsuario;
  }
}
