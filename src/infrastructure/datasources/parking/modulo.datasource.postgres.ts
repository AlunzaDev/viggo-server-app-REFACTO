import { PostgresDatabase } from "../../../data/postgres";
import { ModuloDatasource, type ModuloFilters } from "../../../domain/datasources/parking/modulo.datasource";
import type { ModuloSubmoduloDtoValues } from "../../../domain/dtos/parking/modulo-submodulo.dto";
import type { ModuloEntity, ModuloSubmodulo } from "../../../domain/entities/parking/modulo.entity";
import { CustomError } from "../../../domain/errors/custom.error";
import { UniqueConstraintError } from "../../../domain/errors/unique-constraint.error";
import { isUuid, translatePrismaError, withPrismaErrors } from "../postgres/prisma-errors";
import {
  fromCoordinates,
  moduloInclude,
  toModuloEntity,
  toRemoteSupportData,
  toSubmoduloData,
} from "./modulo.prisma-mapper";

type ModuloInput = Partial<Omit<ModuloEntity, "id">>;

const invalidProyecto = CustomError.badRequest("El proyecto asociado no existe");
const duplicatedSubmodulo = () => CustomError.badRequest("Ya existe un submodulo con ese identificador");

// Device binding/runtime fields are a mirror written from OPERATIVO heartbeats (sync), not here.
const toModuloScalars = (modulo: ModuloInput) => ({
  proyectoId: modulo.proyecto,
  nombre: modulo.nombre,
  tipo: modulo.tipo,
  estado: modulo.estado,
  identificador: modulo.identificador,
  ip: modulo.ip,
  mac: modulo.mac,
  ubicacion: modulo.ubicacion,
  ...fromCoordinates(modulo.coordinates),
  descripcion: modulo.descripcion,
});

const ensureProyectoId = (proyectoId: string | undefined) => {
  if (proyectoId !== undefined && !isUuid(proyectoId)) throw invalidProyecto;
};

export class ModuloPostgresDatasource extends ModuloDatasource {
  private get modulos() {
    return PostgresDatabase.client.modulo;
  }

  private async findEntity(id: string): Promise<ModuloEntity | null> {
    if (!isUuid(id)) return null;
    const row = await this.modulos.findUnique({ where: { id }, include: moduloInclude });
    return row ? toModuloEntity(row) : null;
  }

  private async requireModulo(id: string): Promise<void> {
    const exists = isUuid(id) && (await this.modulos.count({ where: { id } })) > 0;
    if (!exists) throw CustomError.notFound("Modulo no encontrado");
  }

  async create(modulo: Omit<ModuloEntity, "id">): Promise<ModuloEntity> {
    ensureProyectoId(modulo.proyecto);
    // Read back afterwards: an `include` on a nested write runs its relation queries in
    // parallel on the transaction's single connection, which pg@9 will reject (#12).
    const { id } = await withPrismaErrors(
      () =>
        this.modulos.create({
          data: {
            ...toModuloScalars(modulo),
            proyectoId: modulo.proyecto,
            nombre: modulo.nombre,
            tipo: modulo.tipo,
            identificador: modulo.identificador,
            submodulos: {
              create: (modulo.submodulos ?? []).map((submodulo, position) => ({
                ...toSubmoduloData(submodulo),
                position,
              })),
            },
            ...(modulo.remoteSupport ? { remoteSupport: { create: toRemoteSupportData(modulo.remoteSupport) } } : {}),
          },
          select: { id: true },
        }),
      { foreignKey: invalidProyecto },
    );
    return (await this.findEntity(id))!;
  }

  findById(id: string): Promise<ModuloEntity | null> {
    return this.findEntity(id);
  }

  async findByIdentificador(identificador: string): Promise<ModuloEntity | null> {
    const row = await this.modulos.findUnique({ where: { identificador }, include: moduloInclude });
    return row ? toModuloEntity(row) : null;
  }

  async getAll(): Promise<ModuloEntity[]> {
    return this.getFiltered({});
  }

  async getFiltered(filters: ModuloFilters): Promise<ModuloEntity[]> {
    if (filters.proyecto !== undefined && filters.proyecto !== "" && !isUuid(filters.proyecto)) return [];
    const rows = await this.modulos.findMany({
      where: {
        ...(filters.proyecto ? { proyectoId: filters.proyecto } : {}),
        ...(filters.tipo ? { tipo: filters.tipo } : {}),
        ...(typeof filters.estado === "boolean" ? { estado: filters.estado } : {}),
      },
      include: moduloInclude,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map(toModuloEntity);
  }

  getByProyecto(proyectoId: string): Promise<ModuloEntity[]> {
    return isUuid(proyectoId) ? this.getFiltered({ proyecto: proyectoId }) : Promise.resolve([]);
  }

  async update(id: string, modulo: ModuloInput): Promise<ModuloEntity | null> {
    if (!isUuid(id)) return null;
    ensureProyectoId(modulo.proyecto);
    if ((await this.modulos.count({ where: { id } })) === 0) return null;

    await withPrismaErrors(
      () =>
        PostgresDatabase.client.$transaction(async (tx) => {
          if (modulo.remoteSupport === null) {
            await tx.moduloRemoteSupport.deleteMany({ where: { moduloId: id } });
          } else if (modulo.remoteSupport) {
            const data = toRemoteSupportData(modulo.remoteSupport);
            await tx.moduloRemoteSupport.upsert({ where: { moduloId: id }, create: { moduloId: id, ...data }, update: data });
          }
          if (modulo.submodulos !== undefined) {
            await tx.submodulo.deleteMany({ where: { moduloId: id } });
            await tx.submodulo.createMany({
              data: modulo.submodulos.map((submodulo, position) => ({ ...toSubmoduloData(submodulo), moduloId: id, position })),
            });
          }
          await tx.modulo.update({ where: { id }, data: toModuloScalars(modulo) });
        }),
      { foreignKey: invalidProyecto },
    );
    // Read outside the transaction (see create).
    return this.findEntity(id);
  }

  async getSubmodulos(id: string): Promise<ModuloSubmodulo[] | null> {
    return (await this.findEntity(id))?.submodulos ?? null;
  }

  async addSubmodulo(id: string, submodulo: ModuloSubmoduloDtoValues): Promise<ModuloSubmodulo | null> {
    await this.requireModulo(id);
    const data = toSubmoduloData(submodulo);

    try {
      await PostgresDatabase.client.$transaction(async (tx) => {
        const last = await tx.submodulo.aggregate({ where: { moduloId: id }, _max: { position: true } });
        await tx.submodulo.create({ data: { ...data, moduloId: id, position: (last._max.position ?? -1) + 1 } });
      });
    } catch (error) {
      const translated = translatePrismaError(error);
      throw translated instanceof UniqueConstraintError ? duplicatedSubmodulo() : translated;
    }

    const modulo = await this.findEntity(id);
    return modulo?.submodulos.find((item) => item.submoduloId === data.submoduloId) ?? null;
  }

  async updateSubmodulo(
    id: string,
    submoduloId: string,
    submodulo: ModuloSubmoduloDtoValues,
  ): Promise<ModuloSubmodulo | null> {
    await this.requireModulo(id);
    const current = await PostgresDatabase.client.submodulo.findUnique({
      where: { moduloId_submoduloId: { moduloId: id, submoduloId } },
      select: { id: true },
    });
    if (!current) throw CustomError.notFound("Submodulo no encontrado");

    const nextSubmoduloId = submodulo.submoduloId || submoduloId;
    try {
      await PostgresDatabase.client.submodulo.update({
        where: { id: current.id },
        data: toSubmoduloData({ ...submodulo, submoduloId: nextSubmoduloId }),
      });
    } catch (error) {
      const translated = translatePrismaError(error);
      throw translated instanceof UniqueConstraintError ? duplicatedSubmodulo() : translated;
    }

    const modulo = await this.findEntity(id);
    return modulo?.submodulos.find((item) => item.submoduloId === nextSubmoduloId) ?? null;
  }

  async deleteSubmodulo(id: string, submoduloId: string): Promise<ModuloEntity | null> {
    await this.requireModulo(id);
    const { count } = await PostgresDatabase.client.submodulo.deleteMany({ where: { moduloId: id, submoduloId } });
    if (count === 0) throw CustomError.notFound("Submodulo no encontrado");
    return this.findEntity(id);
  }

  async delete(id: string): Promise<ModuloEntity | null> {
    const modulo = await this.findEntity(id);
    if (!modulo) return null;
    await this.modulos.delete({ where: { id } });
    return modulo;
  }
}
