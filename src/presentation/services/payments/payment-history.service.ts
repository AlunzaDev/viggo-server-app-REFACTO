import { CustomError } from "../../../domain/errors/custom.error";
import { PaymentRepository } from "../../../domain/repository/payments/payment.repository";
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

const paymentTypes = new Set<PaymentType>(["ticket", "pension", "renewal"]);
const paymentStatuses = new Set<PaymentStatus>([
  "succeeded",
  "pending",
  "failed",
  "refunded",
]);

export class PaymentHistoryService {
  constructor(private readonly paymentRepository: PaymentRepository) {}

  async getHistory(userId: string, filters: PaymentHistoryFilters) {
    const { page, limit, from, to } = parsePaginationDateQuery(filters);
    const type = this.parseEnum(filters.type, paymentTypes, "type");
    const status = this.parseEnum(filters.status, paymentStatuses, "status");

    const [total, payments] = await Promise.all([
      this.paymentRepository.countByUser(userId, {
        type,
        status,
        from,
        to,
      }),
      this.paymentRepository.getByUser(userId, {
        page,
        limit,
        type,
        status,
        from,
        to,
      }),
    ]);

    return buildPaginatedResponse("payments", payments, total, page, limit);
  }

  async getPaymentDetail(userId: string, paymentId: string) {
    const payment = await this.paymentRepository.findById(paymentId);

    if (!payment || payment.user !== userId) {
      throw CustomError.notFound("Pago no encontrado");
    }

    return payment;
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
