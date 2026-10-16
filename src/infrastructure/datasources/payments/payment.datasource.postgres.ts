import { PostgresDatabase } from "../../../data/postgres";
import type { Payment, Prisma } from "../../../generated/prisma/client";
import {
  PaymentDatasource,
  type NewPaymentRecord,
  type PaymentReconciliationUpdate,
  type PaymentRecord,
  type PaymentRecordLookup,
} from "../../../domain/datasources/payments/payment.datasource";
import {
  PAYMENT_STATUSES,
  PAYMENT_TYPES,
  PaymentEntity,
} from "../../../domain/entities/payments/payment.entity";
import { CustomError } from "../../../domain/errors/custom.error";
import { isUuid, withPrismaErrors } from "../postgres/prisma-errors";

interface PaymentQueryOptions {
  page?: number;
  limit?: number;
  type?: PaymentEntity["type"];
  status?: PaymentEntity["status"];
  search?: string;
  from?: number;
  to?: number;
}

const ms = (value: Date | null) => (value ? value.getTime() : undefined);

const toRecord = (row: Payment): PaymentRecord => ({
  id: row.id,
  user: row.usuarioId,
  type: row.type,
  concept: row.concept,
  amount: row.amount.toNumber(),
  currency: row.currency,
  status: row.status,
  paidAt: row.paidAt.getTime(),
  stripePaymentIntentId: row.stripePaymentIntentId ?? undefined,
  idempotencyKey: row.idempotencyKey ?? undefined,
  appliedOperationKey: row.appliedOperationKey,
  appliedAt: ms(row.appliedAt),
  reconciliationStatus: row.reconciliationStatus,
  reconciledAt: ms(row.reconciledAt),
  reconciliationError: row.reconciliationError,
  metadata: (row.metadata as Record<string, unknown> | null) ?? undefined,
  paymentMethod:
    row.paymentMethodBrand || row.paymentMethodLast4
      ? { brand: row.paymentMethodBrand, last4: row.paymentMethodLast4 }
      : undefined,
  reference: { type: row.referenceType, id: row.referenceId },
  parking:
    row.proyectoId || row.parkingName || row.parkingCity
      ? { id: row.proyectoId ?? "", name: row.parkingName, city: row.parkingCity }
      : undefined,
  rawProviderStatus: row.rawProviderStatus,
});

const toEntity = (row: Payment) => PaymentEntity.fromObject({ ...toRecord(row) });

/**
 * Public JSON of a payment, same fields Mongo's toJSON exposed: internal keys (user,
 * Stripe intent, idempotency, applied operation, raw status, errors, metadata) are omitted.
 */
const toSerialized = (row: Payment): Record<string, unknown> => {
  const record = toRecord(row);
  return {
    id: record.id,
    type: record.type,
    concept: record.concept,
    amount: record.amount,
    currency: record.currency,
    status: record.status,
    paidAt: record.paidAt,
    reconciliationStatus: record.reconciliationStatus,
    ...(record.appliedAt !== undefined ? { appliedAt: record.appliedAt } : {}),
    ...(record.reconciledAt !== undefined ? { reconciledAt: record.reconciledAt } : {}),
    ...(record.paymentMethod ? { paymentMethod: record.paymentMethod } : {}),
    reference: record.reference,
    ...(record.parking ? { parking: record.parking } : {}),
  };
};

const paidAtRange = (from?: number, to?: number): Prisma.DateTimeFilter | undefined =>
  from !== undefined || to !== undefined
    ? {
        ...(from !== undefined ? { gte: new Date(from) } : {}),
        ...(to !== undefined ? { lte: new Date(to) } : {}),
      }
    : undefined;

/** Free-text search over the same fields as before (case-insensitive, literal). */
const searchFilter = (search: string): Prisma.PaymentWhereInput => {
  const term = search.toLowerCase();
  const text = { contains: search, mode: "insensitive" as const };
  return {
    OR: [
      { concept: text },
      { referenceId: text },
      { parkingName: text },
      { parkingCity: text },
      { paymentMethodBrand: text },
      { type: { in: PAYMENT_TYPES.filter((type) => type.includes(term)) } },
      { status: { in: PAYMENT_STATUSES.filter((status) => status.includes(term)) } },
    ],
  };
};

const userWhere = (userId: string, options: Omit<PaymentQueryOptions, "page" | "limit">): Prisma.PaymentWhereInput => ({
  usuarioId: userId,
  ...(options.type ? { type: options.type } : {}),
  ...(options.status ? { status: options.status } : {}),
  ...(options.search?.trim() ? searchFilter(options.search.trim()) : {}),
  ...(paidAtRange(options.from, options.to) ? { paidAt: paidAtRange(options.from, options.to) } : {}),
});

const invalidUser = CustomError.badRequest("El usuario del pago no existe");

export class PaymentPostgresDatasource extends PaymentDatasource {
  private get payments() {
    return PostgresDatabase.client.payment;
  }

  async findRecordByIdempotencyKey(idempotencyKey: string): Promise<PaymentRecord | null> {
    const row = await this.payments.findUnique({ where: { idempotencyKey } });
    return row ? toRecord(row) : null;
  }

  async findRecordByStripePaymentIntentId(stripePaymentIntentId: string): Promise<PaymentRecord | null> {
    const row = await this.payments.findUnique({ where: { stripePaymentIntentId } });
    return row ? toRecord(row) : null;
  }

  async findRecordForUser(lookup: PaymentRecordLookup): Promise<PaymentRecord | null> {
    if (!isUuid(lookup.userId)) return null;
    const row = await this.payments.findFirst({
      where: {
        usuarioId: lookup.userId,
        stripePaymentIntentId: lookup.stripePaymentIntentId,
        referenceId: lookup.referenceId,
        ...(lookup.type ? { type: lookup.type } : {}),
      },
    });
    return row ? toRecord(row) : null;
  }

  async createRecord(payment: NewPaymentRecord): Promise<PaymentRecord> {
    if (!isUuid(payment.user)) throw invalidUser;
    const parkingId = payment.parking?.id;
    const row = await withPrismaErrors(
      () =>
        this.payments.create({
          data: {
            usuarioId: payment.user,
            type: payment.type,
            concept: payment.concept,
            amount: payment.amount,
            currency: payment.currency.trim().toUpperCase(),
            status: payment.status,
            paidAt: new Date(payment.paidAt),
            stripePaymentIntentId: payment.stripePaymentIntentId,
            idempotencyKey: payment.idempotencyKey,
            metadata: payment.metadata as Prisma.InputJsonValue | undefined,
            paymentMethodBrand: payment.paymentMethod?.brand ?? "",
            paymentMethodLast4: payment.paymentMethod?.last4 ?? "",
            referenceType: payment.reference.type,
            referenceId: payment.reference.id,
            proyectoId: isUuid(parkingId) ? parkingId : null,
            parkingName: payment.parking?.name ?? "",
            parkingCity: payment.parking?.city ?? "",
            rawProviderStatus: payment.rawProviderStatus ?? "",
          },
        }),
      { foreignKey: invalidUser },
    );
    return toRecord(row);
  }

  async markSucceeded(id: string, update: { rawProviderStatus: string; paidAt: number }): Promise<PaymentRecord | null> {
    if (!isUuid(id)) return null;
    const { count } = await this.payments.updateMany({
      where: { id },
      data: { status: "succeeded", rawProviderStatus: update.rawProviderStatus, paidAt: new Date(update.paidAt) },
    });
    return count ? this.findRecordById(id) : null;
  }

  async claimForOperation(id: string, operationKey: string, appliedAt: number): Promise<PaymentRecord | null> {
    if (!isUuid(id)) return null;
    // Conditional update: only the first operation can claim the payment (idempotent for the same key).
    const { count } = await this.payments.updateMany({
      where: { id, appliedOperationKey: { in: ["", operationKey] } },
      data: { appliedOperationKey: operationKey, appliedAt: new Date(appliedAt) },
    });
    return count ? this.findRecordById(id) : null;
  }

  async updateReconciliation(id: string, update: PaymentReconciliationUpdate): Promise<void> {
    if (!isUuid(id)) return;
    await this.payments.updateMany({
      where: { id },
      data: {
        rawProviderStatus: update.rawProviderStatus,
        appliedOperationKey: update.appliedOperationKey,
        appliedAt: update.appliedAt === undefined ? undefined : new Date(update.appliedAt),
        reconciliationStatus: update.reconciliationStatus,
        reconciledAt: update.reconciledAt === undefined ? undefined : new Date(update.reconciledAt),
        reconciliationError: update.reconciliationError,
      },
    });
  }

  async findPendingReconciliation(limit: number): Promise<PaymentRecord[]> {
    // Same predicate as the payments_unreconciled_idx partial index.
    const rows = await this.payments.findMany({
      where: {
        type: { not: "external" },
        stripePaymentIntentId: { not: null },
        NOT: { stripePaymentIntentId: "" },
        OR: [
          { status: "pending" },
          { status: "succeeded", reconciliationStatus: { not: "reconciled" } },
          { status: "succeeded", appliedOperationKey: "" },
        ],
      },
      orderBy: { paidAt: "asc" },
      take: limit,
    });
    return rows.map(toRecord);
  }

  async getSerializedByUser(userId: string, options: { page: number; limit: number; from?: number; to?: number }) {
    if (!isUuid(userId)) return { total: 0, payments: [] };
    const where = userWhere(userId, options);
    const [total, rows] = await Promise.all([
      this.payments.count({ where }),
      this.payments.findMany({
        where,
        orderBy: { paidAt: "desc" },
        skip: (options.page - 1) * options.limit,
        take: options.limit,
      }),
    ]);
    return { total, payments: rows.map(toSerialized) };
  }

  async findSerializedByIdForUser(id: string, userId: string): Promise<Record<string, unknown> | null> {
    if (!isUuid(id) || !isUuid(userId)) return null;
    const row = await this.payments.findFirst({ where: { id, usuarioId: userId } });
    return row ? toSerialized(row) : null;
  }

  async create(payment: Omit<PaymentEntity, "id">): Promise<PaymentEntity> {
    const record = await this.createRecord(payment);
    return PaymentEntity.fromObject({ ...record });
  }

  async findById(id: string): Promise<PaymentEntity | null> {
    if (!isUuid(id)) return null;
    const row = await this.payments.findUnique({ where: { id } });
    return row ? toEntity(row) : null;
  }

  async findByStripePaymentIntentId(stripePaymentIntentId: string): Promise<PaymentEntity | null> {
    const row = await this.payments.findUnique({ where: { stripePaymentIntentId } });
    return row ? toEntity(row) : null;
  }

  async getByUser(userId: string, options: PaymentQueryOptions = {}): Promise<PaymentEntity[]> {
    if (!isUuid(userId)) return [];
    const page = options.page && options.page > 0 ? options.page : 1;
    const limit = options.limit && options.limit > 0 ? options.limit : 10;
    const rows = await this.payments.findMany({
      where: userWhere(userId, options),
      orderBy: { paidAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    });
    return rows.map(toEntity);
  }

  countByUser(userId: string, options: Omit<PaymentQueryOptions, "page" | "limit"> = {}): Promise<number> {
    return isUuid(userId) ? this.payments.count({ where: userWhere(userId, options) }) : Promise.resolve(0);
  }

  async update(id: string, payment: Partial<Omit<PaymentEntity, "id">>): Promise<PaymentEntity | null> {
    if (!isUuid(id)) return null;
    const { count } = await this.payments.updateMany({
      where: { id },
      data: {
        type: payment.type,
        concept: payment.concept,
        amount: payment.amount,
        currency: payment.currency?.trim().toUpperCase(),
        status: payment.status,
        paidAt: payment.paidAt === undefined ? undefined : new Date(payment.paidAt),
        stripePaymentIntentId: payment.stripePaymentIntentId,
        paymentMethodBrand: payment.paymentMethod ? payment.paymentMethod.brand ?? "" : undefined,
        paymentMethodLast4: payment.paymentMethod ? payment.paymentMethod.last4 ?? "" : undefined,
        referenceType: payment.reference?.type,
        referenceId: payment.reference?.id,
        parkingName: payment.parking ? payment.parking.name ?? "" : undefined,
        parkingCity: payment.parking ? payment.parking.city ?? "" : undefined,
        rawProviderStatus: payment.rawProviderStatus,
      },
    });
    return count ? this.findById(id) : null;
  }

  private async findRecordById(id: string): Promise<PaymentRecord | null> {
    const row = await this.payments.findUnique({ where: { id } });
    return row ? toRecord(row) : null;
  }
}
