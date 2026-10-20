import { PostgresDatabase } from "../../../data/postgres";
import { Prisma, type PensionPass, type PensionPassOperation } from "../../../generated/prisma/client";
import {
  PensionPassDatasource,
  type PensionPassFinancialOperation,
  type PensionPassMovement,
} from "../../../domain/datasources/pension/pension-pass.datasource";
import { PensionPassEntity } from "../../../domain/entities/pension/pension-pass.entity";
import { CustomError } from "../../../domain/errors/custom.error";
import { UniqueConstraintError } from "../../../domain/errors/unique-constraint.error";
import { isUuid, translatePrismaError, withPrismaErrors } from "../postgres/prisma-errors";

type PensionPassInput = Partial<Omit<PensionPassEntity, "id">>;

// The domain uses -1 for "not contracted yet"; the database uses NULL.
const toValidity = (value: number | undefined) =>
  value === undefined ? undefined : value < 0 ? null : new Date(value);
const fromValidity = (value: Date | null) => (value ? value.getTime() : -1);

const toEntity = (row: PensionPass) =>
  PensionPassEntity.fromObject({
    id: row.id,
    usuario: row.usuarioId,
    name: row.name,
    pension: row.pensionId,
    idPass: row.idPass,
    vigent: row.vigent,
    antiPassback: row.antiPassback,
    inParking: row.inParking,
    created: row.created.getTime(),
    from: fromValidity(row.validFrom),
    to: fromValidity(row.validTo),
    estado: row.estado,
  });

const toOperation = (row: PensionPassOperation): PensionPassFinancialOperation => ({
  key: row.key,
  type: row.type,
  months: row.months,
  from: row.validFrom.getTime(),
  to: row.validTo.getTime(),
  processedAt: row.processedAt.getTime(),
});

const toOperationRow = (pensionPassId: string, operation: PensionPassFinancialOperation) => ({
  key: operation.key,
  pensionPassId,
  type: operation.type,
  months: operation.months,
  validFrom: new Date(operation.from),
  validTo: new Date(operation.to),
  processedAt: new Date(operation.processedAt),
});

const toScalars = (pensionPass: PensionPassInput) => ({
  usuarioId: pensionPass.usuario === undefined ? undefined : pensionPass.usuario || null,
  name: pensionPass.name,
  pensionId: pensionPass.pension,
  idPass: pensionPass.idPass,
  vigent: pensionPass.vigent,
  antiPassback: pensionPass.antiPassback,
  inParking: pensionPass.inParking,
  created: pensionPass.created === undefined ? undefined : new Date(pensionPass.created),
  validFrom: toValidity(pensionPass.from),
  validTo: toValidity(pensionPass.to),
  estado: pensionPass.estado,
});

const invalidReference = CustomError.badRequest("La pension o el usuario asociado no existe");
const invalidValidity = CustomError.badRequest("La vigencia del pension pass no es valida");

/** Thrown inside a transaction to roll it back when a conditional update matched nothing. */
class ConditionNotMet extends Error {}

const assertReferences = (pensionPass: PensionPassInput) => {
  if (pensionPass.pension !== undefined && !isUuid(pensionPass.pension)) throw invalidReference;
  if (pensionPass.usuario && !isUuid(pensionPass.usuario)) throw invalidReference;
  const from = pensionPass.from;
  const to = pensionPass.to;
  if (from !== undefined && to !== undefined && (from < 0) !== (to < 0)) throw invalidValidity;
};

export class PensionPassPostgresDatasource extends PensionPassDatasource {
  private get passes() {
    return PostgresDatabase.client.pensionPass;
  }

  async listMovements(input: { pensionPassId: string; proyectoId: string; from?: number; to?: number; page: number; limit: number }) {
    if (!isUuid(input.pensionPassId) || !isUuid(input.proyectoId)) return { total: 0, movements: [] };
    // The synchronized row keeps OPERATIVO's columns in `payload` (to_jsonb of pension_moves).
    const where = Prisma.sql`
      WHERE m.proyecto_id = ${input.proyectoId}::uuid
        AND m.payload->>'pension_pass_id' = ${input.pensionPassId}
        ${input.from !== undefined ? Prisma.sql`AND (m.payload->>'fecha')::timestamptz >= ${new Date(input.from)}` : Prisma.empty}
        ${input.to !== undefined ? Prisma.sql`AND (m.payload->>'fecha')::timestamptz <= ${new Date(input.to)}` : Prisma.empty}`;
    // One snapshot: the count and the page cannot disagree with a passage arriving in between.
    const [[{ total }], rows] = await PostgresDatabase.client.$transaction([
      PostgresDatabase.client.$queryRaw<Array<{ total: number }>>(Prisma.sql`
        SELECT count(*)::int AS total FROM operational_pension_moves m ${where}`),
      PostgresDatabase.client.$queryRaw<Array<{ id: string; modulo_id: string; modulo_nombre: string | null; tipo: string; fecha: Date }>>(Prisma.sql`
        SELECT m.payload->>'id' AS id, m.payload->>'modulo_id' AS modulo_id, mo.nombre AS modulo_nombre,
               m.payload->>'tipo' AS tipo, (m.payload->>'fecha')::timestamptz AS fecha
        FROM operational_pension_moves m
        LEFT JOIN modulos mo ON mo.id::text = m.payload->>'modulo_id'
        ${where}
        ORDER BY (m.payload->>'fecha')::timestamptz DESC, m.source_position DESC NULLS LAST, m.aggregate_id DESC
        LIMIT ${input.limit} OFFSET ${(input.page - 1) * input.limit}`),
    ], { isolationLevel: "RepeatableRead" });
    const movements: PensionPassMovement[] = rows.map((row) => ({
      uid: row.id,
      modulo: { _id: row.modulo_id, nombre: row.modulo_nombre ?? "" },
      proyecto: input.proyectoId,
      pensionPass: input.pensionPassId,
      tipo: row.tipo,
      fecha: row.fecha.getTime(),
    }));
    return { total, movements };
  }

  private async findEntity(where: Prisma.PensionPassWhereInput): Promise<PensionPassEntity | null> {
    const row = await this.passes.findFirst({ where });
    return row ? toEntity(row) : null;
  }

  async create(pensionPass: Omit<PensionPassEntity, "id">): Promise<PensionPassEntity> {
    assertReferences(pensionPass);
    const row = await withPrismaErrors(
      () =>
        this.passes.create({
          data: {
            ...toScalars(pensionPass),
            pensionId: pensionPass.pension,
            name: pensionPass.name,
            idPass: pensionPass.idPass,
          },
        }),
      { foreignKey: invalidReference },
    );
    return toEntity(row);
  }

  findById(id: string): Promise<PensionPassEntity | null> {
    return isUuid(id) ? this.findEntity({ id }) : Promise.resolve(null);
  }

  findByIdPass(idPass: string): Promise<PensionPassEntity | null> {
    return this.findEntity({ idPass });
  }

  findAvailableByPension(pensionId: string): Promise<PensionPassEntity | null> {
    if (!isUuid(pensionId)) return Promise.resolve(null);
    return this.findEntity({ pensionId, usuarioId: null, validFrom: null, validTo: null, estado: true });
  }

  findByUsuarioAndPension(usuarioId: string, pensionId: string): Promise<PensionPassEntity | null> {
    if (!isUuid(usuarioId) || !isUuid(pensionId)) return Promise.resolve(null);
    return this.findEntity({ usuarioId, pensionId, estado: true });
  }

  async getAll(): Promise<PensionPassEntity[]> {
    return this.findMany({});
  }

  getByPension(pensionId: string): Promise<PensionPassEntity[]> {
    return isUuid(pensionId) ? this.findMany({ pensionId }) : Promise.resolve([]);
  }

  getByUsuario(usuarioId: string): Promise<PensionPassEntity[]> {
    return isUuid(usuarioId) ? this.findMany({ usuarioId }) : Promise.resolve([]);
  }

  async update(id: string, pensionPass: PensionPassInput): Promise<PensionPassEntity | null> {
    if (!isUuid(id)) return null;
    assertReferences(pensionPass);
    if ((await this.passes.count({ where: { id } })) === 0) return null;
    const row = await withPrismaErrors(() => this.passes.update({ where: { id }, data: toScalars(pensionPass) }), {
      foreignKey: invalidReference,
    });
    return toEntity(row);
  }

  async delete(id: string): Promise<PensionPassEntity | null> {
    const pensionPass = await this.findById(id);
    if (!pensionPass) return null;
    await this.passes.delete({ where: { id } });
    return pensionPass;
  }

  async findByFinancialOperationKey(key: string, pensionPassId?: string) {
    if (pensionPassId !== undefined && !isUuid(pensionPassId)) return null;
    const operation = await PostgresDatabase.client.pensionPassOperation.findUnique({
      where: { key },
      include: { pensionPass: true },
    });
    if (!operation || (pensionPassId !== undefined && operation.pensionPassId !== pensionPassId)) return null;
    return { pensionPass: toEntity(operation.pensionPass), operation: toOperation(operation) };
  }

  findActiveByIdAndUsuario(id: string, usuarioId: string): Promise<PensionPassEntity | null> {
    if (!isUuid(id) || !isUuid(usuarioId)) return Promise.resolve(null);
    return this.findEntity({ id, usuarioId, estado: true });
  }

  async claimAvailable(input: {
    pensionId: string;
    usuarioId: string;
    from: number;
    to: number;
    operation: PensionPassFinancialOperation;
  }): Promise<PensionPassEntity | null> {
    if (!isUuid(input.pensionId) || !isUuid(input.usuarioId)) return null;
    try {
      return await PostgresDatabase.client.$transaction(async (tx) => {
        // Lock one free pass; concurrent requests skip it and take the next one.
        const [free] = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM pension_passes
          WHERE pension_id = ${input.pensionId}::uuid AND usuario_id IS NULL
            AND valid_from IS NULL AND valid_to IS NULL AND estado
          ORDER BY created, id
          LIMIT 1
          FOR UPDATE SKIP LOCKED`;
        if (!free) return null;

        const row = await tx.pensionPass.update({
          where: { id: free.id },
          data: {
            usuarioId: input.usuarioId,
            validFrom: new Date(input.from),
            validTo: new Date(input.to),
            vigent: false,
          },
        });
        await tx.pensionPassOperation.create({ data: toOperationRow(free.id, input.operation) });
        return toEntity(row);
      });
    } catch (error) {
      // Duplicated operation key, or the user already holds an active pass of this pension.
      throw translatePrismaError(error, { foreignKey: invalidReference });
    }
  }

  applyRenewal(input: {
    id: string;
    usuarioId: string;
    expectedTo: number;
    from: number;
    to: number;
    operation: PensionPassFinancialOperation;
  }): Promise<PensionPassEntity | null> {
    return this.applyConditionally(
      input.id,
      { usuarioId: input.usuarioId, estado: true, validTo: toValidity(input.expectedTo) ?? null },
      { validFrom: new Date(input.from), validTo: new Date(input.to) },
      input.operation,
    );
  }

  applyContract(input: {
    id: string;
    usuarioId: string;
    expectedFrom: number;
    expectedTo: number;
    operation: PensionPassFinancialOperation;
  }): Promise<PensionPassEntity | null> {
    return this.applyConditionally(
      input.id,
      {
        usuarioId: input.usuarioId,
        estado: true,
        vigent: false,
        validFrom: toValidity(input.expectedFrom) ?? null,
        validTo: toValidity(input.expectedTo) ?? null,
      },
      { vigent: true },
      input.operation,
    );
  }

  async cancel(input: { id: string; cancelledBy: string; reason: string; cancelledAt: number }) {
    if (!isUuid(input.id)) return null;
    const { count } = await this.passes.updateMany({
      where: { id: input.id, estado: true },
      data: {
        estado: false,
        vigent: false,
        cancelledAt: new Date(input.cancelledAt),
        cancelledById: isUuid(input.cancelledBy) ? input.cancelledBy : null,
        cancellationReason: input.reason,
      },
    });
    return count ? this.findById(input.id) : null;
  }

  /**
   * Applies `data` only if the pass still matches `expected` and records the operation,
   * both in one transaction. Returns null when the pass changed or the key was already used
   * (same outcome Mongo's conditional findOneAndUpdate had).
   */
  private async applyConditionally(
    id: string,
    expected: Prisma.PensionPassWhereInput,
    data: Prisma.PensionPassUncheckedUpdateManyInput,
    operation: PensionPassFinancialOperation,
  ): Promise<PensionPassEntity | null> {
    if (!isUuid(id) || (typeof expected.usuarioId === "string" && !isUuid(expected.usuarioId))) return null;
    try {
      return await PostgresDatabase.client.$transaction(async (tx) => {
        const { count } = await tx.pensionPass.updateMany({ where: { id, ...expected }, data });
        if (count === 0) throw new ConditionNotMet();
        await tx.pensionPassOperation.create({ data: toOperationRow(id, operation) });
        return toEntity(await tx.pensionPass.findUniqueOrThrow({ where: { id } }));
      });
    } catch (error) {
      if (error instanceof ConditionNotMet) return null;
      const translated = translatePrismaError(error);
      if (translated instanceof UniqueConstraintError) return null;
      throw translated;
    }
  }

  private async findMany(where: Prisma.PensionPassWhereInput): Promise<PensionPassEntity[]> {
    const rows = await this.passes.findMany({ where, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    return rows.map(toEntity);
  }
}
