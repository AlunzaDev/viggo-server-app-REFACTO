import { MobileOperationModel } from "../../../data/mongo";
import {
  MobileOperationCompletion,
  MobileOperationDatasource,
  MobileOperationFilters,
  MobileOperationRecord,
  MobileOperationStatus,
  NewMobileOperation,
  PageOptions,
} from "../../../domain/datasources/mobile/mobile-operation.datasource";
import { UniqueConstraintError } from "../../../domain/errors/unique-constraint.error";

const asRecord = (document: unknown) => document as MobileOperationRecord;
const asRecords = (documents: unknown[]) => documents as MobileOperationRecord[];

export class MobileOperationMongoDatasource extends MobileOperationDatasource {
  async findByIdempotencyKey(idempotencyKey: string): Promise<MobileOperationRecord | null> {
    return asRecord(await MobileOperationModel.findOne({ idempotencyKey }).lean());
  }

  async findByOperationId(operationId: string, userId?: string): Promise<MobileOperationRecord | null> {
    return asRecord(
      await MobileOperationModel.findOne({ operationId, ...(userId !== undefined ? { userId } : {}) }).lean(),
    );
  }

  async create(operation: NewMobileOperation): Promise<MobileOperationRecord> {
    try {
      return asRecord((await MobileOperationModel.create(operation)).toObject());
    } catch (error) {
      throw UniqueConstraintError.fromMongo(error) ?? error;
    }
  }

  async createIfAbsent(operation: NewMobileOperation): Promise<MobileOperationRecord> {
    return asRecord(
      await MobileOperationModel.findOneAndUpdate(
        { idempotencyKey: operation.idempotencyKey },
        { $setOnInsert: operation },
        { new: true, upsert: true },
      ).lean(),
    );
  }

  async findLatestCompletedWithTicket(userId: string, types?: string[]): Promise<MobileOperationRecord | null> {
    return asRecord(
      await MobileOperationModel.findOne({
        userId,
        status: "completed",
        ...(types ? { type: { $in: types } } : {}),
        "result.ticket": { $exists: true },
      }).sort({ completedAt: -1 }).lean(),
    );
  }

  async findCompletedWithTicket(userId: string, range: { from?: number; to?: number }): Promise<MobileOperationRecord[]> {
    const { from, to } = range;
    return asRecords(
      await MobileOperationModel.find({
        userId,
        status: "completed",
        "result.ticket": { $exists: true },
        ...(from !== undefined || to !== undefined
          ? { completedAt: {
              ...(from !== undefined ? { $gte: from } : {}),
              ...(to !== undefined ? { $lte: to } : {}),
            } }
          : {}),
      }).sort({ completedAt: -1 }).lean(),
    );
  }

  async findCompletedTicketSource(userId: string, ticketId: string): Promise<MobileOperationRecord | null> {
    return asRecord(
      await MobileOperationModel.findOne({
        userId,
        type: "CREATE_TICKET",
        status: "completed",
        "result.ticket.uid": ticketId,
      }).sort({ completedAt: -1 }).lean(),
    );
  }

  async findLatestTicketSource(userId: string, ticketId: string): Promise<MobileOperationRecord | null> {
    return asRecord(
      await MobileOperationModel.findOne({
        userId,
        type: "CREATE_TICKET",
        "result.ticket.uid": ticketId,
      }).sort({ createdAt: -1 }).lean(),
    );
  }

  async list(filters: MobileOperationFilters, { page, limit }: PageOptions) {
    const filter = {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.proyectoId ? { proyectoId: filters.proyectoId } : {}),
      ...(filters.installationId ? { installationId: filters.installationId } : {}),
    };
    const [total, operations] = await Promise.all([
      MobileOperationModel.countDocuments(filter),
      MobileOperationModel.find(filter)
        .sort({ updatedAt: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);
    return { total, operations: asRecords(operations) };
  }

  countByStatus(statuses: MobileOperationStatus[]): Promise<number> {
    return MobileOperationModel.countDocuments({ status: { $in: statuses } });
  }

  async reactivate(operationId: string, now: number): Promise<MobileOperationRecord | null> {
    return asRecord(
      await MobileOperationModel.findOneAndUpdate(
        {
          operationId,
          status: { $in: ["dead_letter", "failed", "expired"] },
        },
        {
          $set: {
            status: "pending",
            error: "",
            nextRetryAt: now,
            processingDeadlineAt: undefined,
            completedAt: undefined,
            updatedAt: now,
          },
        },
        { new: true },
      ).lean(),
    );
  }

  async expireOverdue(installationId: string, now: number): Promise<void> {
    await MobileOperationModel.updateMany(
      {
        installationId,
        status: { $in: ["pending", "processing", "failed"] },
        expiresAt: { $lte: now },
      },
      {
        $set: {
          status: "expired",
          error: "La operacion expiro antes de llegar al estacionamiento",
          completedAt: now,
          updatedAt: now,
        },
      },
    );
  }

  async findRecentDeadLetters(installationId: string, since: number): Promise<MobileOperationRecord[]> {
    return asRecords(
      await MobileOperationModel.find({
        installationId,
        status: "dead_letter",
        updatedAt: { $gte: since },
      }).lean(),
    );
  }

  async releaseStaleProcessing(installationId: string, staleBefore: number, now: number): Promise<void> {
    await MobileOperationModel.updateMany(
      {
        installationId,
        status: "processing",
        claimedAt: { $lt: staleBefore },
        $expr: { $lt: ["$attempts", { $ifNull: ["$maxAttempts", 5] }] },
        $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: now } }],
      },
      {
        $set: {
          status: "pending",
          error: "La operacion quedo en proceso y se liberara para reintento",
          nextRetryAt: now,
          updatedAt: now,
        },
      },
    );
  }

  async moveExhaustedToDeadLetter(installationId: string, now: number): Promise<void> {
    await MobileOperationModel.updateMany(
      {
        installationId,
        status: { $in: ["pending", "processing", "failed"] },
        $expr: { $gte: ["$attempts", { $ifNull: ["$maxAttempts", 5] }] },
      },
      {
        $set: {
          status: "dead_letter",
          error: "La operacion agoto sus intentos automaticos",
          completedAt: now,
          updatedAt: now,
        },
      },
    );
  }

  async claimNext(installationId: string, now: number, processingTimeoutMs: number): Promise<MobileOperationRecord | null> {
    return asRecord(
      await MobileOperationModel.findOneAndUpdate(
        {
          installationId,
          $and: [
            { $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: now } }] },
            { $or: [{ nextRetryAt: { $exists: false } }, { nextRetryAt: { $lte: now } }] },
            { status: { $in: ["pending", "failed"] } },
            { $expr: { $lt: ["$attempts", { $ifNull: ["$maxAttempts", 5] }] } },
          ],
        },
        {
          $set: {
            status: "processing",
            claimedAt: now,
            lastAttemptAt: now,
            processingDeadlineAt: now + processingTimeoutMs,
            updatedAt: now,
          },
          $inc: { attempts: 1 },
        },
        { new: true, sort: { createdAt: 1 } },
      ).lean(),
    );
  }

  async findForCompletion(operationId: string, installationId: string): Promise<MobileOperationRecord | null> {
    return asRecord(
      await MobileOperationModel.findOne({
        operationId,
        installationId,
        status: { $in: ["processing", "completed"] },
      }).lean(),
    );
  }

  async complete(
    operationId: string,
    installationId: string,
    completion: MobileOperationCompletion,
  ): Promise<MobileOperationRecord | null> {
    return asRecord(
      await MobileOperationModel.findOneAndUpdate(
        { operationId, installationId, status: "processing" },
        {
          $set: {
            status: completion.status,
            result: completion.result,
            error: completion.error,
            nextRetryAt: completion.nextRetryAt,
            processingDeadlineAt: undefined,
            completedAt: completion.completedAt,
            updatedAt: completion.updatedAt,
          },
        },
        { new: true },
      ).lean(),
    );
  }

  async backfillRetryPolicy(): Promise<void> {
    await MobileOperationModel.updateMany(
      { maxAttempts: { $exists: false } },
      [
        {
          $set: {
            maxAttempts: {
              $cond: [{ $eq: ["$type", "APPLY_TICKET_PAYMENT"] }, 12, 3],
            },
            nextRetryAt: { $ifNull: ["$nextRetryAt", "$createdAt"] },
          },
        },
      ],
    );
  }

  async recoverStaleProcessing(now: number, staleBefore: number): Promise<void> {
    await MobileOperationModel.updateMany(
      {
        status: "processing",
        $or: [
          { processingDeadlineAt: { $lte: now } },
          { claimedAt: { $lt: staleBefore } },
        ],
      },
      {
        $set: {
          status: "pending",
          error: "Operacion recuperada al reiniciar Admin API",
          nextRetryAt: now,
          processingDeadlineAt: undefined,
          updatedAt: now,
        },
      },
    );
  }
}
