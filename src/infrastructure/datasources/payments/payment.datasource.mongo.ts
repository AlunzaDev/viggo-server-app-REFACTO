import { PaymentModel } from "../../../data/mongo/models/payments/payment.schema";
import {
  NewPaymentRecord,
  PaymentDatasource,
  PaymentReconciliationUpdate,
  PaymentRecord,
  PaymentRecordLookup,
} from "../../../domain/datasources/payments/payment.datasource";
import { PaymentEntity } from "../../../domain/entities/payments/payment.entity";

const toPaymentRecord = (document: Record<string, any>): PaymentRecord => {
  const { _id, user, ...rest } = document;
  return { ...rest, id: String(_id), user: String(user) } as PaymentRecord;
};

interface PaymentQueryOptions {
  page?: number;
  limit?: number;
  type?: PaymentEntity["type"];
  status?: PaymentEntity["status"];
  search?: string;
  from?: number;
  to?: number;
}

export class PaymentMongoDatasource extends PaymentDatasource {
  async findRecordByIdempotencyKey(idempotencyKey: string): Promise<PaymentRecord | null> {
    const document = await PaymentModel.findOne({ idempotencyKey }).lean();
    return document ? toPaymentRecord(document) : null;
  }

  async findRecordByStripePaymentIntentId(stripePaymentIntentId: string): Promise<PaymentRecord | null> {
    const document = await PaymentModel.findOne({ stripePaymentIntentId }).lean();
    return document ? toPaymentRecord(document) : null;
  }

  async findRecordForUser(lookup: PaymentRecordLookup): Promise<PaymentRecord | null> {
    const document = await PaymentModel.findOne({
      user: lookup.userId,
      ...(lookup.type ? { type: lookup.type } : {}),
      stripePaymentIntentId: lookup.stripePaymentIntentId,
      "reference.id": lookup.referenceId,
    }).lean();
    return document ? toPaymentRecord(document) : null;
  }

  async createRecord(payment: NewPaymentRecord): Promise<PaymentRecord> {
    const document = await PaymentModel.create(payment);
    return toPaymentRecord(document.toObject());
  }

  async markSucceeded(
    id: string,
    update: { rawProviderStatus: string; paidAt: number },
  ): Promise<PaymentRecord | null> {
    const document = await PaymentModel.findByIdAndUpdate(
      id,
      { $set: { status: "succeeded", rawProviderStatus: update.rawProviderStatus, paidAt: update.paidAt } },
      { new: true },
    ).lean();
    return document ? toPaymentRecord(document) : null;
  }

  async claimForOperation(id: string, operationKey: string, appliedAt: number): Promise<PaymentRecord | null> {
    const document = await PaymentModel.findOneAndUpdate(
      {
        _id: id,
        $or: [
          { appliedOperationKey: { $exists: false } },
          { appliedOperationKey: "" },
          { appliedOperationKey: operationKey },
        ],
      },
      { $set: { appliedOperationKey: operationKey, appliedAt } },
      { new: true },
    ).lean();
    return document ? toPaymentRecord(document) : null;
  }

  async updateReconciliation(id: string, update: PaymentReconciliationUpdate): Promise<void> {
    await PaymentModel.updateOne({ _id: id }, { $set: update });
  }

  async findPendingReconciliation(limit: number): Promise<PaymentRecord[]> {
    const documents = await PaymentModel.find({
      stripePaymentIntentId: { $exists: true, $ne: "" },
      $or: [
        { status: "pending" },
        { status: "succeeded", reconciliationStatus: { $ne: "reconciled" } },
        { status: "succeeded", appliedOperationKey: { $in: [null, ""] } },
        { status: "succeeded", appliedOperationKey: { $exists: false } },
      ],
    })
      .sort({ paidAt: 1 })
      .limit(limit)
      .lean();
    return documents.map(toPaymentRecord);
  }

  async getSerializedByUser(
    userId: string,
    options: { page: number; limit: number; from?: number; to?: number },
  ) {
    const { page, limit, from, to } = options;
    const filter = {
      user: userId,
      ...(from !== undefined || to !== undefined
        ? { paidAt: {
            ...(from !== undefined ? { $gte: from } : {}),
            ...(to !== undefined ? { $lte: to } : {}),
          } }
        : {}),
    };
    const [total, documents] = await Promise.all([
      PaymentModel.countDocuments(filter),
      PaymentModel.find(filter).sort({ paidAt: -1 }).skip((page - 1) * limit).limit(limit),
    ]);
    return {
      total,
      payments: documents.map((document) => document.toJSON() as Record<string, unknown>),
    };
  }

  async findSerializedByIdForUser(id: string, userId: string): Promise<Record<string, unknown> | null> {
    const document = await PaymentModel.findOne({ _id: id, user: userId });
    return document ? (document.toJSON() as Record<string, unknown>) : null;
  }

  async create(payment: Omit<PaymentEntity, "id">): Promise<PaymentEntity> {
    const paymentDocument = await PaymentModel.create(payment);
    return PaymentEntity.fromObject(paymentDocument.toObject());
  }

  async findById(id: string): Promise<PaymentEntity | null> {
    const paymentDocument = await PaymentModel.findById(id);
    if (!paymentDocument) return null;

    return PaymentEntity.fromObject(paymentDocument.toObject());
  }

  async findByStripePaymentIntentId(
    stripePaymentIntentId: string,
  ): Promise<PaymentEntity | null> {
    const paymentDocument = await PaymentModel.findOne({
      stripePaymentIntentId,
    });
    if (!paymentDocument) return null;

    return PaymentEntity.fromObject(paymentDocument.toObject());
  }

  async getByUser(
    userId: string,
    options: PaymentQueryOptions = {},
  ): Promise<PaymentEntity[]> {
    const query = this.buildUserQuery(userId, options);
    const page = options.page && options.page > 0 ? options.page : 1;
    const limit = options.limit && options.limit > 0 ? options.limit : 10;

    const paymentDocuments = await PaymentModel.find(query)
      .sort({ paidAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    return paymentDocuments.map((payment) =>
      PaymentEntity.fromObject(payment.toObject()),
    );
  }

  async countByUser(
    userId: string,
    options: Omit<PaymentQueryOptions, "page" | "limit"> = {},
  ): Promise<number> {
    const query = this.buildUserQuery(userId, options);
    return PaymentModel.countDocuments(query);
  }

  async update(
    id: string,
    payment: Partial<Omit<PaymentEntity, "id">>,
  ): Promise<PaymentEntity | null> {
    const paymentDocument = await PaymentModel.findByIdAndUpdate(id, payment, {
      new: true,
    });

    if (!paymentDocument) return null;

    return PaymentEntity.fromObject(paymentDocument.toObject());
  }

  private buildUserQuery(
    userId: string,
    options: Omit<PaymentQueryOptions, "page" | "limit">,
  ) {
    const query: {
      user: string;
      type?: PaymentEntity["type"];
      status?: PaymentEntity["status"];
      $or?: Array<Record<string, unknown>>;
      paidAt?: {
        $gte?: number;
        $lte?: number;
      };
    } = {
      user: userId,
    };

    if (options.type) query.type = options.type;
    if (options.status) query.status = options.status;

    if (options.search) {
      const normalizedSearch = options.search.trim();
      if (normalizedSearch) {
        const regex = new RegExp(normalizedSearch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
        query.$or = [
          { concept: regex },
          { type: regex },
          { status: regex },
          { "reference.id": regex },
          { "parking.name": regex },
          { "parking.city": regex },
          { "paymentMethod.brand": regex },
        ];
      }
    }

    if (options.from !== undefined || options.to !== undefined) {
      query.paidAt = {};
      if (options.from !== undefined) query.paidAt.$gte = options.from;
      if (options.to !== undefined) query.paidAt.$lte = options.to;
    }

    return query;
  }
}
