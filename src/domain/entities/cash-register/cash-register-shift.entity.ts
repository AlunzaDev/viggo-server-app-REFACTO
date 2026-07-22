import { CustomError } from "../../errors/custom.error";

export const CASH_REGISTER_SHIFT_STATUSES = [
  "open",
  "closed",
  "reconciled",
  "cancelled",
] as const;

export type CashRegisterShiftStatus =
  (typeof CASH_REGISTER_SHIFT_STATUSES)[number];

export interface CashRegisterShiftEntityOptions {
  id: string;
  proyectoId: string;
  moduloId: string;
  moduloIdentificador?: string;
  moduloNombre?: string;
  openedByUserId: string;
  openedByUserName?: string;
  status: CashRegisterShiftStatus;
  openingAmount: number;
  openedAt: number;
  closedAt?: number;
  closingAmountExpected?: number;
  closingAmountCounted?: number;
  differenceAmount?: number;
  notes?: string;
  metadata?: Record<string, unknown>;
}

export class CashRegisterShiftEntity {
  public id: string;
  public proyectoId: string;
  public moduloId: string;
  public moduloIdentificador?: string;
  public moduloNombre?: string;
  public openedByUserId: string;
  public openedByUserName?: string;
  public status: CashRegisterShiftStatus;
  public openingAmount: number;
  public openedAt: number;
  public closedAt?: number;
  public closingAmountExpected?: number;
  public closingAmountCounted?: number;
  public differenceAmount?: number;
  public notes?: string;
  public metadata?: Record<string, unknown>;

  constructor(options: CashRegisterShiftEntityOptions) {
    this.id = options.id;
    this.proyectoId = options.proyectoId;
    this.moduloId = options.moduloId;
    this.moduloIdentificador = options.moduloIdentificador;
    this.moduloNombre = options.moduloNombre;
    this.openedByUserId = options.openedByUserId;
    this.openedByUserName = options.openedByUserName;
    this.status = options.status;
    this.openingAmount = options.openingAmount;
    this.openedAt = options.openedAt;
    this.closedAt = options.closedAt;
    this.closingAmountExpected = options.closingAmountExpected;
    this.closingAmountCounted = options.closingAmountCounted;
    this.differenceAmount = options.differenceAmount;
    this.notes = options.notes;
    this.metadata = options.metadata;
  }

  static fromObject(object: Record<string, unknown>): CashRegisterShiftEntity {
    const {
      _id,
      id,
      proyectoId,
      moduloId,
      moduloIdentificador,
      moduloNombre,
      openedByUserId,
      openedByUserName,
      status,
      openingAmount,
      openedAt,
      closedAt,
      closingAmountExpected,
      closingAmountCounted,
      differenceAmount,
      notes,
      metadata,
    } = object;

    const shiftId = id || (_id ? String(_id) : undefined);

    if (!shiftId) throw CustomError.badRequest("Missing id");
    if (!proyectoId) throw CustomError.badRequest("Missing proyectoId");
    if (!moduloId) throw CustomError.badRequest("Missing moduloId");
    if (!openedByUserId) throw CustomError.badRequest("Missing openedByUserId");
    if (!status) throw CustomError.badRequest("Missing status");
    if (openingAmount === undefined || openingAmount === null) {
      throw CustomError.badRequest("Missing openingAmount");
    }
    if (openedAt === undefined || openedAt === null) {
      throw CustomError.badRequest("Missing openedAt");
    }

    if (
      typeof status !== "string" ||
      !CASH_REGISTER_SHIFT_STATUSES.includes(status as CashRegisterShiftStatus)
    ) {
      throw CustomError.badRequest("Invalid cash register shift status");
    }

    return new CashRegisterShiftEntity({
      id: String(shiftId),
      proyectoId: String(proyectoId),
      moduloId: String(moduloId),
      moduloIdentificador: moduloIdentificador
        ? String(moduloIdentificador).trim()
        : undefined,
      moduloNombre: moduloNombre ? String(moduloNombre).trim() : undefined,
      openedByUserId: String(openedByUserId),
      openedByUserName: openedByUserName
        ? String(openedByUserName).trim()
        : undefined,
      status: status as CashRegisterShiftStatus,
      openingAmount: Number(openingAmount),
      openedAt: Number(openedAt),
      closedAt:
        closedAt === undefined || closedAt === null ? undefined : Number(closedAt),
      closingAmountExpected:
        closingAmountExpected === undefined || closingAmountExpected === null
          ? undefined
          : Number(closingAmountExpected),
      closingAmountCounted:
        closingAmountCounted === undefined || closingAmountCounted === null
          ? undefined
          : Number(closingAmountCounted),
      differenceAmount:
        differenceAmount === undefined || differenceAmount === null
          ? undefined
          : Number(differenceAmount),
      notes: notes ? String(notes).trim() : undefined,
      metadata:
        metadata && typeof metadata === "object"
          ? (metadata as Record<string, unknown>)
          : undefined,
    });
  }
}
