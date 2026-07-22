import { CustomError } from "../../errors/custom.error";

export const CASH_REGISTER_CUT_STATUSES = [
  "balanced",
  "short",
  "over",
] as const;

export type CashRegisterCutStatus = (typeof CASH_REGISTER_CUT_STATUSES)[number];

export interface CashRegisterCutEntityOptions {
  id: string;
  shiftId: string;
  generatedByUserId: string;
  generatedByUserName?: string;
  generatedAt: number;
  openingAmount: number;
  totalIn: number;
  totalOut: number;
  expectedAmount: number;
  countedAmount: number;
  differenceAmount: number;
  status: CashRegisterCutStatus;
  notes?: string;
}

export class CashRegisterCutEntity {
  public id: string;
  public shiftId: string;
  public generatedByUserId: string;
  public generatedByUserName?: string;
  public generatedAt: number;
  public openingAmount: number;
  public totalIn: number;
  public totalOut: number;
  public expectedAmount: number;
  public countedAmount: number;
  public differenceAmount: number;
  public status: CashRegisterCutStatus;
  public notes?: string;

  constructor(options: CashRegisterCutEntityOptions) {
    this.id = options.id;
    this.shiftId = options.shiftId;
    this.generatedByUserId = options.generatedByUserId;
    this.generatedByUserName = options.generatedByUserName;
    this.generatedAt = options.generatedAt;
    this.openingAmount = options.openingAmount;
    this.totalIn = options.totalIn;
    this.totalOut = options.totalOut;
    this.expectedAmount = options.expectedAmount;
    this.countedAmount = options.countedAmount;
    this.differenceAmount = options.differenceAmount;
    this.status = options.status;
    this.notes = options.notes;
  }

  static fromObject(object: Record<string, unknown>): CashRegisterCutEntity {
    const {
      _id,
      id,
      shiftId,
      generatedByUserId,
      generatedByUserName,
      generatedAt,
      openingAmount,
      totalIn,
      totalOut,
      expectedAmount,
      countedAmount,
      differenceAmount,
      status,
      notes,
    } = object;

    const cutId = id || (_id ? String(_id) : undefined);

    if (!cutId) throw CustomError.badRequest("Missing id");
    if (!shiftId) throw CustomError.badRequest("Missing shiftId");
    if (!generatedByUserId) throw CustomError.badRequest("Missing generatedByUserId");
    if (generatedAt === undefined || generatedAt === null) {
      throw CustomError.badRequest("Missing generatedAt");
    }
    if (openingAmount === undefined || openingAmount === null) {
      throw CustomError.badRequest("Missing openingAmount");
    }
    if (totalIn === undefined || totalIn === null) {
      throw CustomError.badRequest("Missing totalIn");
    }
    if (totalOut === undefined || totalOut === null) {
      throw CustomError.badRequest("Missing totalOut");
    }
    if (expectedAmount === undefined || expectedAmount === null) {
      throw CustomError.badRequest("Missing expectedAmount");
    }
    if (countedAmount === undefined || countedAmount === null) {
      throw CustomError.badRequest("Missing countedAmount");
    }
    if (differenceAmount === undefined || differenceAmount === null) {
      throw CustomError.badRequest("Missing differenceAmount");
    }
    if (!status) throw CustomError.badRequest("Missing status");

    if (
      typeof status !== "string" ||
      !CASH_REGISTER_CUT_STATUSES.includes(status as CashRegisterCutStatus)
    ) {
      throw CustomError.badRequest("Invalid cash register cut status");
    }

    return new CashRegisterCutEntity({
      id: String(cutId),
      shiftId: String(shiftId),
      generatedByUserId: String(generatedByUserId),
      generatedByUserName: generatedByUserName
        ? String(generatedByUserName).trim()
        : undefined,
      generatedAt: Number(generatedAt),
      openingAmount: Number(openingAmount),
      totalIn: Number(totalIn),
      totalOut: Number(totalOut),
      expectedAmount: Number(expectedAmount),
      countedAmount: Number(countedAmount),
      differenceAmount: Number(differenceAmount),
      status: status as CashRegisterCutStatus,
      notes: notes ? String(notes).trim() : undefined,
    });
  }
}
