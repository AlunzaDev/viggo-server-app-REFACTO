import type { UserAppAccess } from "../../constants";
import { PermissionProfileEntity } from "../../entities/auth/permission-profile.entity";

export abstract class PermissionProfileRepository {
  abstract create(
    profile: Omit<PermissionProfileEntity, "id">,
  ): Promise<PermissionProfileEntity>;

  abstract getAll(app?: UserAppAccess): Promise<PermissionProfileEntity[]>;

  abstract findById(id: string): Promise<PermissionProfileEntity | null>;

  abstract findByNombre(
    app: UserAppAccess,
    nombre: string,
  ): Promise<PermissionProfileEntity | null>;

  abstract update(
    id: string,
    profile: Partial<Omit<PermissionProfileEntity, "id" | "app">>,
  ): Promise<PermissionProfileEntity | null>;

  abstract delete(id: string): Promise<PermissionProfileEntity | null>;
}
