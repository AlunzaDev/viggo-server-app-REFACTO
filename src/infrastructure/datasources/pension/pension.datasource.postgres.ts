import { PostgresDatabase } from "../../../data/postgres";
import type { Prisma } from "../../../generated/prisma/client";
import { PensionDatasource } from "../../../domain/datasources/pension/pension.datasource";
import { PensionEntity, type PensionValidezItemEntity } from "../../../domain/entities/pension/pension.entity";
import { CustomError } from "../../../domain/errors/custom.error";
import { isUuid, withPrismaErrors } from "../postgres/prisma-errors";

const pensionInclude = { horarios: { orderBy: { weekDay: "asc" } } } satisfies Prisma.PensionInclude;
type PensionRow = Prisma.PensionGetPayload<{ include: typeof pensionInclude }>;
type PensionInput = Partial<Omit<PensionEntity, "id">>;

const toHourMinute = (minutes: number) => [Math.floor(minutes / 60), minutes % 60];

const toPensionEntity = (row: PensionRow) =>
  PensionEntity.fromObject({
    id: row.id,
    proyecto: row.proyectoId,
    nombre: row.nombre,
    validez: row.horarios.map((horario) => ({
      weekDay: horario.weekDay,
      from: toHourMinute(horario.fromMinutes),
      to: toHourMinute(horario.toMinutes),
    })),
    precio: row.precio.toNumber(),
    descripcion: row.descripcion,
    estado: row.estado,
  });

const invalidValidez = (message: string) => CustomError.badRequest(message, undefined, "VALIDATION_ERROR");

/** Same rules the Mongo schema enforced, plus valid ranges (one row per weekday 0..6, HH:MM). */
const toHorarioRows = (validez: PensionValidezItemEntity[]) => {
  if (validez.length !== 7) {
    throw invalidValidez("La validez debe contener un elemento por cada dia de la semana");
  }
  const toMinutes = (value: number[], label: string) => {
    if (value.length !== 2) throw invalidValidez(`${label} debe contener 2 elementos [HOUR, MINUTES]`);
    const [hour, minute] = value;
    if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      throw invalidValidez(`${label} debe ser una hora valida [0-23, 0-59]`);
    }
    return hour * 60 + minute;
  };
  const rows = validez.map((item) => ({
    weekDay: item.weekDay,
    fromMinutes: toMinutes(item.from, "From"),
    toMinutes: toMinutes(item.to, "To"),
  }));
  const days = new Set(rows.map((row) => row.weekDay));
  if (days.size !== 7 || rows.some((row) => !Number.isInteger(row.weekDay) || row.weekDay < 0 || row.weekDay > 6)) {
    throw invalidValidez("La validez debe contener los dias 0 a 6 sin repetir");
  }
  return rows;
};

const toPensionScalars = (pension: PensionInput) => ({
  proyectoId: pension.proyecto,
  nombre: pension.nombre,
  precio: pension.precio,
  descripcion: pension.descripcion,
  estado: pension.estado,
});

const invalidProyecto = CustomError.badRequest("El proyecto asociado no existe");
const pensionInUse = CustomError.conflict(
  "No se puede eliminar la pension porque tiene pension passes asociados",
);

export class PensionPostgresDatasource extends PensionDatasource {
  private get pensiones() {
    return PostgresDatabase.client.pension;
  }

  async create(pension: Omit<PensionEntity, "id">): Promise<PensionEntity> {
    if (!isUuid(pension.proyecto)) throw invalidProyecto;
    const horarios = toHorarioRows(pension.validez);
    const row = await withPrismaErrors(
      () =>
        this.pensiones.create({
          data: {
            ...toPensionScalars(pension),
            proyectoId: pension.proyecto,
            nombre: pension.nombre,
            precio: pension.precio,
            horarios: { create: horarios },
          },
          include: pensionInclude,
        }),
      { foreignKey: invalidProyecto },
    );
    return toPensionEntity(row);
  }

  async findById(id: string): Promise<PensionEntity | null> {
    if (!isUuid(id)) return null;
    const row = await this.pensiones.findUnique({ where: { id }, include: pensionInclude });
    return row ? toPensionEntity(row) : null;
  }

  async getAll(): Promise<PensionEntity[]> {
    const rows = await this.pensiones.findMany({ include: pensionInclude, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    return rows.map(toPensionEntity);
  }

  async getByProyecto(proyectoId: string): Promise<PensionEntity[]> {
    if (!isUuid(proyectoId)) return [];
    const rows = await this.pensiones.findMany({
      where: { proyectoId },
      include: pensionInclude,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map(toPensionEntity);
  }

  async update(id: string, pension: PensionInput): Promise<PensionEntity | null> {
    if (!isUuid(id)) return null;
    if (pension.proyecto !== undefined && !isUuid(pension.proyecto)) throw invalidProyecto;
    const horarios = pension.validez !== undefined ? toHorarioRows(pension.validez) : undefined;
    if ((await this.pensiones.count({ where: { id } })) === 0) return null;

    const row = await withPrismaErrors(
      () =>
        PostgresDatabase.client.$transaction(async (tx) => {
          if (horarios) {
            await tx.pensionHorario.deleteMany({ where: { pensionId: id } });
            await tx.pensionHorario.createMany({ data: horarios.map((horario) => ({ ...horario, pensionId: id })) });
          }
          return tx.pension.update({ where: { id }, data: toPensionScalars(pension), include: pensionInclude });
        }),
      { foreignKey: invalidProyecto },
    );
    return toPensionEntity(row);
  }

  async delete(id: string): Promise<PensionEntity | null> {
    const pension = await this.findById(id);
    if (!pension) return null;
    await withPrismaErrors(() => this.pensiones.delete({ where: { id } }), { foreignKey: pensionInUse });
    return pension;
  }

  async cancel(input: { id: string; cancelledBy: string; reason: string; cancelledAt: number }): Promise<PensionEntity | null> {
    if (!isUuid(input.id)) return null;
    const { count } = await this.pensiones.updateMany({
      where: { id: input.id, estado: true },
      data: {
        estado: false,
        cancelledAt: new Date(input.cancelledAt),
        cancelledById: isUuid(input.cancelledBy) ? input.cancelledBy : null,
        cancellationReason: input.reason,
      },
    });
    return count ? this.findById(input.id) : null;
  }
}
