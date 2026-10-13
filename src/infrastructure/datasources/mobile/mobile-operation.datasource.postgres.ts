import { PostgresDatabase } from "../../../data/postgres";
import type { MobileOperation, Prisma } from "../../../generated/prisma/client";
import {
  MOBILE_OPERATION_STATUSES,
  MobileOperationDatasource,
  type MobileOperationCompletion,
  type MobileOperationFilters,
  type MobileOperationRecord,
  type MobileOperationStatus,
  type NewMobileOperation,
  type PageOptions,
} from "../../../domain/datasources/mobile/mobile-operation.datasource";
import { CustomError } from "../../../domain/errors/custom.error";
import { UniqueConstraintError } from "../../../domain/errors/unique-constraint.error";
import { isUuid, withPrismaErrors } from "../postgres/prisma-errors";

const MOBILE_OPERATION_TYPES = ["CREATE_TICKET", "QUOTE_TICKET", "APPLY_TICKET_PAYMENT", "EXIT_TICKET"] as const;
type MobileOperationType = (typeof MOBILE_OPERATION_TYPES)[number];

const isType = (value: string): value is MobileOperationType =>
  (MOBILE_OPERATION_TYPES as readonly string[]).includes(value);
const isStatus = (value: string): value is MobileOperationStatus =>
  (MOBILE_OPERATION_STATUSES as readonly string[]).includes(value);

const ms = (value: Date | null) => (value ? value.getTime() : undefined);
const at = (value: number | undefined) => (value === undefined ? undefined : new Date(value));

/** Same shape the queue had in Mongo (epoch ms, optional fields omitted when unset). */
const toRecord = (row: MobileOperation): MobileOperationRecord => ({
  operationId: row.operationId,
  idempotencyKey: row.idempotencyKey,
  type: row.type,
  installationId: row.installationId,
  proyectoId: row.proyectoId,
  userId: row.usuarioId,
  payload: row.payload as Record<string, unknown>,
  ...(row.result !== null ? { result: row.result as Record<string, any> } : {}),
  status: row.status,
  error: row.error,
  attempts: row.attempts,
  maxAttempts: row.maxAttempts,
  nextRetryAt: ms(row.nextRetryAt),
  claimedAt: ms(row.claimedAt),
  lastAttemptAt: ms(row.lastAttemptAt),
  processingDeadlineAt: ms(row.processingDeadlineAt),
  completedAt: ms(row.completedAt),
  expiresAt: ms(row.expiresAt),
  createdAt: row.createdAt.getTime(),
  updatedAt: row.updatedAt.getTime(),
});

/** Ticket id reported by OPERATIVO (result.ticket.uid, or id), indexed for lookups. */
const ticketIdOf = (result: Record<string, unknown> | undefined): string | undefined => {
  const ticket = result?.ticket as Record<string, unknown> | undefined;
  const id = ticket?.uid ?? ticket?.id;
  return id === undefined || id === null || id === "" ? undefined : String(id);
};

const invalidReference = CustomError.badRequest("La instalacion, el proyecto o el usuario de la operacion no existe");

export class MobileOperationPostgresDatasource extends MobileOperationDatasource {
  private get operations() {
    return PostgresDatabase.client.mobileOperation;
  }

  private async findOne(where: Prisma.MobileOperationWhereInput, orderBy?: Prisma.MobileOperationOrderByWithRelationInput) {
    const row = await this.operations.findFirst({ where, orderBy });
    return row ? toRecord(row) : null;
  }

  findByIdempotencyKey(idempotencyKey: string) {
    return this.findOne({ idempotencyKey });
  }

  findByOperationId(operationId: string, userId?: string) {
    if (!isUuid(operationId) || (userId !== undefined && !isUuid(userId))) return Promise.resolve(null);
    return this.findOne({ operationId, ...(userId !== undefined ? { usuarioId: userId } : {}) });
  }

  async create(operation: NewMobileOperation): Promise<MobileOperationRecord> {
    if (!isType(operation.type)) throw CustomError.badRequest("Tipo de operacion movil no soportado");
    if (!isUuid(operation.proyectoId) || !isUuid(operation.userId)) throw invalidReference;
    const row = await withPrismaErrors(
      () =>
        this.operations.create({
          data: {
            operationId: operation.operationId,
            idempotencyKey: operation.idempotencyKey,
            type: operation.type as MobileOperationType,
            installationId: operation.installationId,
            proyectoId: operation.proyectoId,
            usuarioId: operation.userId,
            payload: operation.payload as Prisma.InputJsonValue,
            status: operation.status,
            attempts: operation.attempts,
            maxAttempts: operation.maxAttempts,
            nextRetryAt: at(operation.nextRetryAt),
            expiresAt: at(operation.expiresAt),
            createdAt: new Date(operation.createdAt),
            updatedAt: new Date(operation.updatedAt),
          },
        }),
      { foreignKey: invalidReference },
    );
    return toRecord(row);
  }

  async createIfAbsent(operation: NewMobileOperation): Promise<MobileOperationRecord> {
    try {
      return await this.create(operation);
    } catch (error) {
      if (!(error instanceof UniqueConstraintError)) throw error;
      const existing = await this.findByIdempotencyKey(operation.idempotencyKey);
      if (!existing) throw error;
      return existing;
    }
  }

  findLatestCompletedWithTicket(userId: string, types?: string[]) {
    if (!isUuid(userId)) return Promise.resolve(null);
    return this.findOne(
      {
        usuarioId: userId,
        status: "completed",
        ticketId: { not: null },
        ...(types ? { type: { in: types.filter(isType) } } : {}),
      },
      { completedAt: "desc" },
    );
  }

  async findCompletedWithTicket(userId: string, range: { from?: number; to?: number }) {
    if (!isUuid(userId)) return [];
    const rows = await this.operations.findMany({
      where: {
        usuarioId: userId,
        status: "completed",
        ticketId: { not: null },
        ...(range.from !== undefined || range.to !== undefined
          ? { completedAt: { ...(range.from !== undefined ? { gte: new Date(range.from) } : {}), ...(range.to !== undefined ? { lte: new Date(range.to) } : {}) } }
          : {}),
      },
      orderBy: { completedAt: "desc" },
    });
    return rows.map(toRecord);
  }

  findCompletedTicketSource(userId: string, ticketId: string) {
    if (!isUuid(userId)) return Promise.resolve(null);
    return this.findOne({ usuarioId: userId, type: "CREATE_TICKET", status: "completed", ticketId }, { completedAt: "desc" });
  }

  findLatestTicketSource(userId: string, ticketId: string) {
    if (!isUuid(userId)) return Promise.resolve(null);
    return this.findOne({ usuarioId: userId, type: "CREATE_TICKET", ticketId }, { createdAt: "desc" });
  }

  async list(filters: MobileOperationFilters, { page, limit }: PageOptions) {
    if ((filters.status && !isStatus(filters.status)) || (filters.type && !isType(filters.type))) {
      return { total: 0, operations: [] };
    }
    if (filters.proyectoId && !isUuid(filters.proyectoId)) return { total: 0, operations: [] };
    const where: Prisma.MobileOperationWhereInput = {
      ...(filters.status ? { status: filters.status as MobileOperationStatus } : {}),
      ...(filters.type ? { type: filters.type as MobileOperationType } : {}),
      ...(filters.proyectoId ? { proyectoId: filters.proyectoId } : {}),
      ...(filters.installationId ? { installationId: filters.installationId } : {}),
    };
    const [total, rows] = await Promise.all([
      this.operations.count({ where }),
      this.operations.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return { total, operations: rows.map(toRecord) };
  }

  countByStatus(statuses: MobileOperationStatus[]) {
    return this.operations.count({ where: { status: { in: statuses } } });
  }

  async reactivate(operationId: string, now: number) {
    if (!isUuid(operationId)) return null;
    const { count } = await this.operations.updateMany({
      where: { operationId, status: { in: ["dead_letter", "failed", "expired"] } },
      data: {
        status: "pending",
        error: "",
        nextRetryAt: new Date(now),
        processingDeadlineAt: null,
        completedAt: null,
        updatedAt: new Date(now),
      },
    });
    return count ? this.findByOperationId(operationId) : null;
  }

  async expireOverdue(installationId: string, now: number) {
    await this.operations.updateMany({
      where: { installationId, status: { in: ["pending", "processing", "failed"] }, expiresAt: { lte: new Date(now) } },
      data: {
        status: "expired",
        error: "La operacion expiro antes de llegar al estacionamiento",
        completedAt: new Date(now),
        updatedAt: new Date(now),
      },
    });
  }

  async findRecentDeadLetters(installationId: string, since: number) {
    const rows = await this.operations.findMany({
      where: { installationId, status: "dead_letter", updatedAt: { gte: new Date(since) } },
    });
    return rows.map(toRecord);
  }

  async releaseStaleProcessing(installationId: string, staleBefore: number, now: number) {
    await this.operations.updateMany({
      where: {
        installationId,
        status: "processing",
        claimedAt: { lt: new Date(staleBefore) },
        attempts: { lt: this.operations.fields.maxAttempts },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date(now) } }],
      },
      data: {
        status: "pending",
        error: "La operacion quedo en proceso y se liberara para reintento",
        nextRetryAt: new Date(now),
        updatedAt: new Date(now),
      },
    });
  }

  async moveExhaustedToDeadLetter(installationId: string, now: number) {
    await this.operations.updateMany({
      where: {
        installationId,
        status: { in: ["pending", "processing", "failed"] },
        attempts: { gte: this.operations.fields.maxAttempts },
      },
      data: {
        status: "dead_letter",
        error: "La operacion agoto sus intentos automaticos",
        completedAt: new Date(now),
        updatedAt: new Date(now),
      },
    });
  }

  async claimNext(installationId: string, now: number, processingTimeoutMs: number) {
    const nowAt = new Date(now);
    // Pick and claim the oldest due command in one statement; concurrent pollers skip locked rows.
    const [claimed] = await PostgresDatabase.client.$queryRaw<Array<{ operation_id: string }>>`
      UPDATE mobile_operations
      SET status = 'processing',
          claimed_at = ${nowAt},
          last_attempt_at = ${nowAt},
          processing_deadline_at = ${new Date(now + processingTimeoutMs)},
          updated_at = ${nowAt},
          attempts = attempts + 1
      WHERE operation_id = (
        SELECT operation_id FROM mobile_operations
        WHERE installation_id = ${installationId}
          AND status IN ('pending', 'failed')
          AND (expires_at IS NULL OR expires_at > ${nowAt})
          AND (next_retry_at IS NULL OR next_retry_at <= ${nowAt})
          AND attempts < max_attempts
        ORDER BY created_at
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING operation_id`;
    return claimed ? this.findByOperationId(claimed.operation_id) : null;
  }

  findForCompletion(operationId: string, installationId: string) {
    if (!isUuid(operationId)) return Promise.resolve(null);
    return this.findOne({ operationId, installationId, status: { in: ["processing", "completed"] } });
  }

  async complete(operationId: string, installationId: string, completion: MobileOperationCompletion) {
    if (!isUuid(operationId)) return null;
    // Undefined fields are left untouched, as the Mongo $set did.
    const { count } = await this.operations.updateMany({
      where: { operationId, installationId, status: "processing" },
      data: {
        status: completion.status,
        ...(completion.result !== undefined
          ? { result: completion.result as Prisma.InputJsonValue, ticketId: ticketIdOf(completion.result) ?? null }
          : {}),
        error: completion.error,
        nextRetryAt: at(completion.nextRetryAt),
        processingDeadlineAt: null,
        completedAt: at(completion.completedAt),
        updatedAt: new Date(completion.updatedAt),
      },
    });
    return count ? this.findByOperationId(operationId) : null;
  }

  /** Mongo needed to backfill retry fields on old documents; here they are NOT NULL with defaults. */
  async backfillRetryPolicy() {}

  async recoverStaleProcessing(now: number, staleBefore: number) {
    await this.operations.updateMany({
      where: {
        status: "processing",
        OR: [{ processingDeadlineAt: { lte: new Date(now) } }, { claimedAt: { lt: new Date(staleBefore) } }],
      },
      data: {
        status: "pending",
        error: "Operacion recuperada al reiniciar Admin API",
        nextRetryAt: new Date(now),
        processingDeadlineAt: null,
        updatedAt: new Date(now),
      },
    });
  }
}

