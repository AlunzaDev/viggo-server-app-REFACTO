import { FilterQuery } from "mongoose";
import { PaymentModel } from "../../../data/mongo/models/payments/payment.schema";
import { CustomError } from "../../../domain/errors/custom.error";

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
    const page = this.parsePositiveInteger(filters.page, 1, 1, 500);
    const limit = this.parsePositiveInteger(filters.limit, 20, 1, 100);
    const query = this.buildQuery(userId, filters);

    const [total, payments] = await Promise.all([
      PaymentModel.countDocuments(query),
      PaymentModel.find(query)
        .sort({ paidAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
    ]);

    return {
      total,
      page,
      limit,
      payments: payments.map((payment) => payment.toJSON()),
    };
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
    const from = this.parseDate(filters.from, "from", false);
    const to = this.parseDate(filters.to, "to", true);

    if (type) query.type = type;
    if (status) query.status = status;

    if (from || to) {
      query.paidAt = {};
      if (from) query.paidAt.$gte = from;
      if (to) query.paidAt.$lte = to;
    }

    return query;
  }

  private parsePositiveInteger(
    value: unknown,
    fallback: number,
    min: number,
    max: number,
  ) {
    if (value === undefined) return fallback;

    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
      throw CustomError.badRequest(
        `El parametro debe ser un entero entre ${min} y ${max}`,
      );
    }

    return parsed;
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

  private parseDate(
    value: unknown,
    field: string,
    endOfDay: boolean,
  ): number | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw CustomError.badRequest(`'${field}' debe tener formato YYYY-MM-DD`);
    }

    const suffix = endOfDay ? "T23:59:59.999Z" : "T00:00:00.000Z";
    const timestamp = Date.parse(`${value}${suffix}`);
    if (Number.isNaN(timestamp)) {
      throw CustomError.badRequest(`Fecha invalida para '${field}'`);
    }

    return timestamp;
  }
}
