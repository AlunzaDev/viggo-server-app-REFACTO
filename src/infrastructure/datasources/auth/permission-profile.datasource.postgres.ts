import { PostgresDatabase } from "../../../data/postgres";
import type { PermissionProfile } from "../../../generated/prisma/client";
import type { UserAppAccess } from "../../../domain/constants";
import { PermissionProfileDatasource } from "../../../domain/datasources/auth/permission-profile.datasource";
import { PermissionProfileEntity } from "../../../domain/entities/auth/permission-profile.entity";
import { CustomError } from "../../../domain/errors/custom.error";
import { isUuid, withPrismaErrors } from "../postgres/prisma-errors";

const toEntity = (row: PermissionProfile) =>
  PermissionProfileEntity.fromObject({
    id: row.id,
    app: row.app,
    nombre: row.nombre,
    descripcion: row.descripcion,
    modules: row.modules,
    estado: row.estado,
  });

// Same order as before: app, then nombre, compared as plain strings
// (Postgres would sort the app enum by declaration order and nombre by collation).
const byAppAndNombre = (a: PermissionProfile, b: PermissionProfile) =>
  a.app < b.app ? -1 : a.app > b.app ? 1 : a.nombre < b.nombre ? -1 : a.nombre > b.nombre ? 1 : 0;

const profileInUse = CustomError.conflict(
  "No se puede eliminar el perfil porque está asignado a usuarios",
);

export class PermissionProfilePostgresDatasource extends PermissionProfileDatasource {
  private get profiles() {
    return PostgresDatabase.client.permissionProfile;
  }

  async create(profile: Omit<PermissionProfileEntity, "id">): Promise<PermissionProfileEntity> {
    const row = await withPrismaErrors(() =>
      this.profiles.create({
        data: {
          app: profile.app,
          nombre: profile.nombre,
          descripcion: profile.descripcion ?? "",
          modules: profile.modules,
          estado: profile.estado,
        },
      }),
    );
    return toEntity(row);
  }

  async getAll(app?: UserAppAccess): Promise<PermissionProfileEntity[]> {
    const rows = await this.profiles.findMany({ where: app ? { app } : {} });
    return rows.sort(byAppAndNombre).map(toEntity);
  }

  async findById(id: string): Promise<PermissionProfileEntity | null> {
    if (!isUuid(id)) return null;
    const row = await this.profiles.findUnique({ where: { id } });
    return row ? toEntity(row) : null;
  }

  async findByNombre(app: UserAppAccess, nombre: string): Promise<PermissionProfileEntity | null> {
    const row = await this.profiles.findUnique({ where: { app_nombre: { app, nombre } } });
    return row ? toEntity(row) : null;
  }

  async update(
    id: string,
    profile: Partial<Omit<PermissionProfileEntity, "id" | "app">>,
  ): Promise<PermissionProfileEntity | null> {
    if (!isUuid(id)) return null;
    const exists = await this.profiles.findUnique({ where: { id }, select: { id: true } });
    if (!exists) return null;

    const row = await withPrismaErrors(() =>
      this.profiles.update({
        where: { id },
        data: {
          nombre: profile.nombre,
          descripcion: profile.descripcion,
          modules: profile.modules,
          estado: profile.estado,
        },
      }),
    );
    return toEntity(row);
  }

  async delete(id: string): Promise<PermissionProfileEntity | null> {
    if (!isUuid(id)) return null;
    const row = await this.profiles.findUnique({ where: { id } });
    if (!row) return null;

    await withPrismaErrors(() => this.profiles.delete({ where: { id } }), { foreignKey: profileInUse });
    return toEntity(row);
  }
}
