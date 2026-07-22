import { PermissionProfileEntity } from "../../entities/auth/permission-profile.entity";

export abstract class PermissionProfileDatasource {
  abstract create(
    profile: Omit<PermissionProfileEntity, "id">,
  ): Promise<PermissionProfileEntity>;
  abstract getAll(): Promise<PermissionProfileEntity[]>;
  abstract findById(id: string): Promise<PermissionProfileEntity | null>;
  abstract findByNombre(nombre: string): Promise<PermissionProfileEntity | null>;
  abstract update(
    id: string,
    profile: Partial<Omit<PermissionProfileEntity, "id">>,
  ): Promise<PermissionProfileEntity | null>;
  abstract delete(id: string): Promise<PermissionProfileEntity | null>;
}
