import type { UserAppAccess } from "../../../domain/constants";
import { PermissionProfileDatasource } from "../../../domain/datasources/auth/permission-profile.datasource";
import { PermissionProfileEntity } from "../../../domain/entities/auth/permission-profile.entity";
import { PermissionProfileRepository } from "../../../domain/repositories/auth/permission-profile.repository";

export class PermissionProfileRepositoryImpl implements PermissionProfileRepository {
  constructor(private readonly datasource: PermissionProfileDatasource) {}

  create(
    profile: Omit<PermissionProfileEntity, "id">,
  ): Promise<PermissionProfileEntity> {
    return this.datasource.create(profile);
  }

  getAll(app?: UserAppAccess): Promise<PermissionProfileEntity[]> {
    return this.datasource.getAll(app);
  }

  findById(id: string): Promise<PermissionProfileEntity | null> {
    return this.datasource.findById(id);
  }

  findByNombre(
    app: UserAppAccess,
    nombre: string,
  ): Promise<PermissionProfileEntity | null> {
    return this.datasource.findByNombre(app, nombre);
  }

  update(
    id: string,
    profile: Partial<Omit<PermissionProfileEntity, "id" | "app">>,
  ): Promise<PermissionProfileEntity | null> {
    return this.datasource.update(id, profile);
  }

  delete(id: string): Promise<PermissionProfileEntity | null> {
    return this.datasource.delete(id);
  }
}
