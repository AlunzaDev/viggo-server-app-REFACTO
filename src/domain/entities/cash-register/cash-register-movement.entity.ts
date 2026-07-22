import { CustomError } from "../../errors/custom.error";

export const CASH_REGISTER_MOVEMENT_TYPES = [
  "opening_fund",
  "ticket_payment_income",
  "manual_income",
  "manual_expense",
  "cash_withdrawal",
  "refund",
  "adjustment",
] as const;

export type CashRegisterMovementType =
  (typeof CASH_REGISTER_MOVEMENT_TYPES)[number];

export const CASH_REGISTER_MOVEMENT_DIRECTIONS = ["in", "out"] as const;

export type CashRegisterMovementDirection =
  (typeof CASH_REGISTER_MOVEMENT_DIRECTIONS)[number];

export interface CashRegisterMovementEntityOptions {
  id: string;
  shiftId: string;
  proyectoId: string;
  moduloId: string;
  createdByUserId: string;
  createdByUserName?: string;
  type: CashRegisterMovementType;
  direction: CashRegisterMovementDirection;
  concept: string;
  amount: number;
  createdAt: number;
  relatedTicketId?: string;
  relatedPaymentId?: string;
  relatedCashPaymentSessionId?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
}

export class CashRegisterMovementEntity {
  public id: string;
  public shiftId: string;
  public proyectoId: string;
  public moduloId: string;
  public createdByUserId: string;
  public createdByUserName?: string;
  public type: CashRegisterMovementType;
  public direction: CashRegisterMovementDirection;
  public concept: string;
  public amount: number;
  public createdAt: number;
  public relatedTicketId?: string;
  public relatedPaymentId?: string;
  public relatedCashPaymentSessionId?: string;
  public notes?: string;
  public metadata?: Record<string, unknown>;

  constructor(options: CashRegisterMovementEntityOptions) {
    this.id = options.id;
    this.shiftId = options.shiftId;
    this.proyectoId = options.proyectoId;
    this.moduloId = options.moduloId;
    this.createdByUserId = options.createdByUserId;
    this.createdByUserName = options.createdByUserName;
    this.type = options.type;
    this.direction = options.direction;
    this.concept = options.concept;
    this.amount = options.amount;
    this.createdAt = options.createdAt;
    this.relatedTicketId = options.relatedTicketId;
    this.relatedPaymentId = options.relatedPaymentId;
    this.relatedCashPaymentSessionId = options.relatedCashPaymentSessionId;
    this.notes = options.notes;
    this.metadata = options.metadata;
  }

  static fromObject(
    object: Record<string, unknown>,
  ): CashRegisterMovementEntity {
    const {
      _id,
      id,
      shiftId,
      proyectoId,
      moduloId,
      createdByUserId,
      createdByUserName,
      type,
      direction,
      concept,
      amount,
      createdAt,
      relatedTicketId,
      relatedPaymentId,
      relatedCashPaymentSessionId,
      notes,
      metadata,
    } = object;

    const movementId = id || (_id ? String(_id) : undefined);

    if (!movementId) throw CustomError.badRequest("Missing id");
    if (!shiftId) throw CustomError.badRequest("Missing shiftId");
    if (!proyectoId) throw CustomError.badRequest("Missing proyectoId");
    if (!moduloId) throw CustomError.badRequest("Missing moduloId");
    if (!createdByUserId) throw CustomError.badRequest("Missing createdByUserId");
    if (!type) throw CustomError.badRequest("Missing type");
    if (!direction) throw CustomError.badRequest("Missing direction");
    if (!concept) throw CustomError.badRequest("Missing concept");
    if (amount === undefined || amount === null) {
      throw CustomError.badRequest("Missing amount");
    }
    if (createdAt === undefined || createdAt === null) {
      throw CustomError.badRequest("Missing createdAt");
    }

    if (
      typeof type !== "string" ||
      !CASH_REGISTER_MOVEMENT_TYPES.includes(type as CashRegisterMovementType)
    ) {
      throw CustomError.badRequest("Invalid cash register movement type");
    }

    if (
      typeof direction !== "string" ||
      !CASH_REGISTER_MOVEMENT_DIRECTIONS.includes(
        direction as CashRegisterMovementDirection,
      )
    ) {
      throw CustomError.badRequest("Invalid cash register movement direction");
    }

    return new CashRegisterMovementEntity({
      id: String(movementId),
      shiftId: String(shiftId),
      proyectoId: String(proyectoId),
      moduloId: String(moduloId),
      createdByUserId: String(createdByUserId),
      createdByUserName: createdByUserName
        ? String(createdByUserName).trim()
        : undefined,
      type: type as CashRegisterMovementType,
      direction: direction as CashRegisterMovementDirection,
      concept: String(concept).trim(),
      amount: Number(amount),
      createdAt: Number(createdAt),
      relatedTicketId: relatedTicketId ? String(relatedTicketId).trim() : undefined,
      relatedPaymentId: relatedPaymentId
        ? String(relatedPaymentId).trim()
        : undefined,
      relatedCashPaymentSessionId: relatedCashPaymentSessionId
        ? String(relatedCashPaymentSessionId).trim()
        : undefined,
      notes: notes ? String(notes).trim() : undefined,
      metadata:
        metadata && typeof metadata === "object"
          ? (metadata as Record<string, unknown>)
          : undefined,
    });
  }
}
