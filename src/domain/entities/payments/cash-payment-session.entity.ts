import { CustomError } from "../../errors/custom.error";

export const CASH_PAYMENT_SESSION_STATUSES = [
  "created",
  "pending_cash",
  "partially_paid",
  "paid",
  "cancelled",
  "expired",
  "failed",
] as const;

export type CashPaymentSessionStatus =
  (typeof CASH_PAYMENT_SESSION_STATUSES)[number];

export const CASH_PAYMENT_EVENT_TYPES = [
  "session_created",
  "qr_resolved",
  "cash_inserted",
  "cash_rejected",
  "change_calculated",
  "session_completed",
  "session_cancelled",
  "session_expired",
  "session_failed",
] as const;

export type CashPaymentEventType = (typeof CASH_PAYMENT_EVENT_TYPES)[number];

export interface CashPaymentSessionEvent {
  type: CashPaymentEventType;
  amount?: number;
  payload?: Record<string, unknown>;
  createdAt: number;
}

export interface CashPaymentSessionEntityOptions {
  id: string;
  ticketId: string;
  idBoleto: string;
  status: CashPaymentSessionStatus;
  amountExpected: number;
  amountReceived: number;
  changeAmount: number;
  moduloId: string;
  moduloIdentificador?: string;
  moduloNombre?: string;
  deviceId?: string;
  startedAt: number;
  completedAt?: number;
  cancelledAt?: number;
  events: CashPaymentSessionEvent[];
}

export class CashPaymentSessionEntity {
  public id: string;
  public ticketId: string;
  public idBoleto: string;
  public status: CashPaymentSessionStatus;
  public amountExpected: number;
  public amountReceived: number;
  public changeAmount: number;
  public moduloId: string;
  public moduloIdentificador?: string;
  public moduloNombre?: string;
  public deviceId?: string;
  public startedAt: number;
  public completedAt?: number;
  public cancelledAt?: number;
  public events: CashPaymentSessionEvent[];

  constructor(options: CashPaymentSessionEntityOptions) {
    this.id = options.id;
    this.ticketId = options.ticketId;
    this.idBoleto = options.idBoleto;
    this.status = options.status;
    this.amountExpected = options.amountExpected;
    this.amountReceived = options.amountReceived;
    this.changeAmount = options.changeAmount;
    this.moduloId = options.moduloId;
    this.moduloIdentificador = options.moduloIdentificador;
    this.moduloNombre = options.moduloNombre;
    this.deviceId = options.deviceId;
    this.startedAt = options.startedAt;
    this.completedAt = options.completedAt;
    this.cancelledAt = options.cancelledAt;
    this.events = options.events;
  }

  static fromObject(object: {
    [key: string]: unknown;
  }): CashPaymentSessionEntity {
    const {
      _id,
      id,
      ticketId,
      idBoleto,
      status,
      amountExpected,
      amountReceived,
      changeAmount,
      moduloId,
      moduloIdentificador,
      moduloNombre,
      deviceId,
      startedAt,
      completedAt,
      cancelledAt,
      events,
    } = object;

    const sessionId = id || (_id ? String(_id) : undefined);

    if (!sessionId) throw CustomError.badRequest("Missing id");
    if (!ticketId) throw CustomError.badRequest("Missing ticketId");
    if (!idBoleto) throw CustomError.badRequest("Missing idBoleto");
    if (!status) throw CustomError.badRequest("Missing status");
    if (amountExpected === undefined || amountExpected === null) {
      throw CustomError.badRequest("Missing amountExpected");
    }
    if (amountReceived === undefined || amountReceived === null) {
      throw CustomError.badRequest("Missing amountReceived");
    }
    if (changeAmount === undefined || changeAmount === null) {
      throw CustomError.badRequest("Missing changeAmount");
    }
    if (!moduloId) throw CustomError.badRequest("Missing moduloId");
    if (startedAt === undefined || startedAt === null) {
      throw CustomError.badRequest("Missing startedAt");
    }

    if (
      typeof status !== "string" ||
      !CASH_PAYMENT_SESSION_STATUSES.includes(
        status as CashPaymentSessionStatus,
      )
    ) {
      throw CustomError.badRequest("Invalid cash payment session status");
    }

    const normalizedEvents = Array.isArray(events)
      ? events.map((event) => CashPaymentSessionEntity.mapEvent(event))
      : [];

    return new CashPaymentSessionEntity({
      id: String(sessionId),
      ticketId: String(ticketId),
      idBoleto: String(idBoleto).trim(),
      status: status as CashPaymentSessionStatus,
      amountExpected: Number(amountExpected),
      amountReceived: Number(amountReceived),
      changeAmount: Number(changeAmount),
      moduloId: String(moduloId),
      moduloIdentificador: moduloIdentificador
        ? String(moduloIdentificador)
        : undefined,
      moduloNombre: moduloNombre ? String(moduloNombre) : undefined,
      deviceId: deviceId ? String(deviceId) : undefined,
      startedAt: Number(startedAt),
      completedAt:
        completedAt === undefined || completedAt === null
          ? undefined
          : Number(completedAt),
      cancelledAt:
        cancelledAt === undefined || cancelledAt === null
          ? undefined
          : Number(cancelledAt),
      events: normalizedEvents,
    });
  }

  private static mapEvent(event: unknown): CashPaymentSessionEvent {
    if (!event || typeof event !== "object") {
      throw CustomError.badRequest("Invalid cash payment session event");
    }

    const { type, amount, payload, createdAt } = event as {
      type?: unknown;
      amount?: unknown;
      payload?: unknown;
      createdAt?: unknown;
    };

    if (!type || typeof type !== "string") {
      throw CustomError.badRequest("Missing event type");
    }

    if (!CASH_PAYMENT_EVENT_TYPES.includes(type as CashPaymentEventType)) {
      throw CustomError.badRequest("Invalid cash payment event type");
    }

    if (createdAt === undefined || createdAt === null) {
      throw CustomError.badRequest("Missing event createdAt");
    }

    return {
      type: type as CashPaymentEventType,
      amount:
        amount === undefined || amount === null ? undefined : Number(amount),
      payload:
        payload && typeof payload === "object"
          ? (payload as Record<string, unknown>)
          : undefined,
      createdAt: Number(createdAt),
    };
  }
}
