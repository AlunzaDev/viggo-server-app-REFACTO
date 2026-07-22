import { Schema, model } from "mongoose";

const cashRegisterMovementSchema = new Schema(
  {
    shiftId: {
      type: String,
      required: [true, "El turno es obligatorio"],
      trim: true,
      index: true,
    },
    proyectoId: {
      type: String,
      required: [true, "El proyecto es obligatorio"],
      trim: true,
      index: true,
    },
    moduloId: {
      type: String,
      required: [true, "La caja es obligatoria"],
      trim: true,
      index: true,
    },
    createdByUserId: {
      type: String,
      required: [true, "El usuario es obligatorio"],
      trim: true,
    },
    createdByUserName: {
      type: String,
      default: undefined,
      trim: true,
    },
    type: {
      type: String,
      required: [true, "El tipo es obligatorio"],
      enum: [
        "opening_fund",
        "ticket_payment_income",
        "manual_income",
        "manual_expense",
        "cash_withdrawal",
        "refund",
        "adjustment",
      ],
      index: true,
    },
    direction: {
      type: String,
      required: [true, "La direccion es obligatoria"],
      enum: ["in", "out"],
    },
    concept: {
      type: String,
      required: [true, "El concepto es obligatorio"],
      trim: true,
    },
    amount: {
      type: Number,
      required: [true, "El importe es obligatorio"],
      min: [0, "El importe no puede ser negativo"],
    },
    createdAt: {
      type: Number,
      required: [true, "La fecha es obligatoria"],
      index: true,
    },
    relatedTicketId: {
      type: String,
      default: undefined,
      trim: true,
    },
    relatedPaymentId: {
      type: String,
      default: undefined,
      trim: true,
    },
    relatedCashPaymentSessionId: {
      type: String,
      default: undefined,
      trim: true,
      index: true,
    },
    notes: {
      type: String,
      default: undefined,
      trim: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: undefined,
    },
  },
  {
    versionKey: false,
    timestamps: false,
  },
);

cashRegisterMovementSchema.index({ shiftId: 1, createdAt: -1 });
cashRegisterMovementSchema.index(
  { relatedCashPaymentSessionId: 1 },
  { unique: true, sparse: true },
);

export const CashRegisterMovementModel = model(
  "CashRegisterMovement",
  cashRegisterMovementSchema,
);
