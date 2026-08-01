import { PaymentModel } from "../../../data/mongo/models/payments/payment.schema";
import { PaymentDatasource } from "../../../domain/datasources/payments/payment.datasource";
import { PaymentEntity } from "../../../domain/entities/payments/payment.entity";

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
