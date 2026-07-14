import { FilterQuery } from "mongoose";
import { PaymentModel } from "../../../data/mongo/models/payments/payment.schema";
import { CustomError } from "../../../domain/errors/custom.error";
import {
  buildPaginatedResponse,
  parsePaginationDateQuery,
} from "../shared/pagination-query";

type PaymentType = "ticket" | "pension" | "renewal";
type PaymentStatus = "succeeded" | "pending" | "failed" | "refunded";

interface PaymentHistoryFilters {
  page?: unknown;
  limit?: unknown;
  type?: unknown;
  status?: unknown;
  from?: unknown;
  to?: unknown;
}

interface PaymentQuery {
  user: string;
  type?: PaymentType;
  status?: PaymentStatus;
  paidAt?: {
    $gte?: number;
    $lte?: number;
  };
}

const paymentTypes = new Set<PaymentType>(["ticket", "pension", "renewal"]);
const paymentStatuses = new Set<PaymentStatus>([
  "succeeded",
  "pending",
  "failed",
  "refunded",
]);

export class PaymentHistoryService {
  async getHistory(userId: string, filters: PaymentHistoryFilters) {
    const { page, limit } = parsePaginationDateQuery(filters);
    const query = this.buildQuery(userId, filters);

    const [total, payments] = await Promise.all([
      PaymentModel.countDocuments(query),
      PaymentModel.find(query)
        .sort({ paidAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
    ]);

    return buildPaginatedResponse(
      "payments",
      payments.map((payment) => payment.toJSON()),
      total,
      page,
      limit,
    );
  }

  async getPaymentDetail(userId: string, paymentId: string) {
    const payment = await PaymentModel.findOne({
      _id: paymentId,
      user: userId,
    });

    if (!payment) {
      throw CustomError.notFound("Pago no encontrado");
    }

    return payment.toJSON();
  }

  private buildQuery(
    userId: string,
    filters: PaymentHistoryFilters,
  ): FilterQuery<PaymentQuery> {
    const query: FilterQuery<PaymentQuery> = { user: userId };
    const type = this.parseEnum(filters.type, paymentTypes, "type");
    const status = this.parseEnum(filters.status, paymentStatuses, "status");
    const { from, to } = parsePaginationDateQuery(filters);

    if (type) query.type = type;
    if (status) query.status = status;

    if (from || to) {
      query.paidAt = {};
      if (from) query.paidAt.$gte = from;
      if (to) query.paidAt.$lte = to;
    }

    return query;
  }
  private parseEnum<T extends string>(
    value: unknown,
    allowedValues: Set<T>,
    field: string,
  ): T | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== "string" || !allowedValues.has(value as T)) {
      throw CustomError.badRequest(`Valor invalido para '${field}'`);
    }

    return value as T;
  }
}
