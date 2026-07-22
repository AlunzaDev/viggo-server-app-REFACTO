import { CustomError } from "../../errors/custom.error";

export interface CashRegisterCountLine {
  label: string;
  value: number;
  quantity: number;
  subtotal: number;
}

export interface CashRegisterCountEntityOptions {
  id: string;
  shiftId: string;
  countedByUserId: string;
  countedByUserName?: string;
  countedAt: number;
  denominations: CashRegisterCountLine[];
  totalAmount: number;
  notes?: string;
}

export class CashRegisterCountEntity {
  public id: string;
  public shiftId: string;
  public countedByUserId: string;
  public countedByUserName?: string;
  public countedAt: number;
  public denominations: CashRegisterCountLine[];
  public totalAmount: number;
  public notes?: string;

  constructor(options: CashRegisterCountEntityOptions) {
    this.id = options.id;
    this.shiftId = options.shiftId;
    this.countedByUserId = options.countedByUserId;
    this.countedByUserName = options.countedByUserName;
    this.countedAt = options.countedAt;
    this.denominations = options.denominations;
    this.totalAmount = options.totalAmount;
    this.notes = options.notes;
  }

  static fromObject(object: Record<string, unknown>): CashRegisterCountEntity {
    const {
      _id,
      id,
      shiftId,
      countedByUserId,
      countedByUserName,
      countedAt,
      denominations,
      totalAmount,
      notes,
    } = object;

    const countId = id || (_id ? String(_id) : undefined);

    if (!countId) throw CustomError.badRequest("Missing id");
    if (!shiftId) throw CustomError.badRequest("Missing shiftId");
    if (!countedByUserId) throw CustomError.badRequest("Missing countedByUserId");
    if (countedAt === undefined || countedAt === null) {
      throw CustomError.badRequest("Missing countedAt");
    }
    if (!Array.isArray(denominations)) {
      throw CustomError.badRequest("Missing denominations");
    }
    if (totalAmount === undefined || totalAmount === null) {
      throw CustomError.badRequest("Missing totalAmount");
    }

    return new CashRegisterCountEntity({
      id: String(countId),
      shiftId: String(shiftId),
      countedByUserId: String(countedByUserId),
      countedByUserName: countedByUserName
        ? String(countedByUserName).trim()
        : undefined,
      countedAt: Number(countedAt),
      denominations: denominations.map((line) =>
        CashRegisterCountEntity.mapLine(line),
      ),
      totalAmount: Number(totalAmount),
      notes: notes ? String(notes).trim() : undefined,
    });
  }

  private static mapLine(value: unknown): CashRegisterCountLine {
    if (!value || typeof value !== "object") {
      throw CustomError.badRequest("Invalid denomination line");
    }

    const { label, value: amountValue, quantity, subtotal } = value as {
      label?: unknown;
      value?: unknown;
      quantity?: unknown;
      subtotal?: unknown;
    };

    if (!label) throw CustomError.badRequest("Missing denomination label");
    if (amountValue === undefined || amountValue === null) {
      throw CustomError.badRequest("Missing denomination value");
    }
    if (quantity === undefined || quantity === null) {
      throw CustomError.badRequest("Missing denomination quantity");
    }
    if (subtotal === undefined || subtotal === null) {
      throw CustomError.badRequest("Missing denomination subtotal");
    }

    return {
      label: String(label).trim(),
      value: Number(amountValue),
      quantity: Number(quantity),
      subtotal: Number(subtotal),
    };
  }
}
