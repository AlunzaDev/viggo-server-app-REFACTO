import { PermissionProfileDatasource } from "../../../domain/datasources/auth/permission-profile.datasource";
import { PermissionProfileEntity } from "../../../domain/entities/auth/permission-profile.entity";
import { PermissionProfileRepository } from "../../../domain/repository/auth/permission-profile.repository";

export class PermissionProfileRepositoryImpl
  implements PermissionProfileRepository
{
  constructor(
    private readonly datasource: PermissionProfileDatasource,
  ) {}

  create(
    profile: Omit<PermissionProfileEntity, "id">,
  ): Promise<PermissionProfileEntity> {
    return this.datasource.create(profile);
  }

  getAll(): Promise<PermissionProfileEntity[]> {
    return this.datasource.getAll();
  }

  findById(id: string): Promise<PermissionProfileEntity | null> {
    return this.datasource.findById(id);
  }

  findByNombre(nombre: string): Promise<PermissionProfileEntity | null> {
    return this.datasource.findByNombre(nombre);
  }

  update(
    id: string,
    profile: Partial<Omit<PermissionProfileEntity, "id">>,
  ): Promise<PermissionProfileEntity | null> {
    return this.datasource.update(id, profile);
  }

  delete(id: string): Promise<PermissionProfileEntity | null> {
    return this.datasource.delete(id);
  }
}
