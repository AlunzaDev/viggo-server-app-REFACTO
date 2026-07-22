import { Schema, model } from "mongoose";

const cashRegisterShiftSchema = new Schema(
  {
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
    moduloIdentificador: {
      type: String,
      default: undefined,
      trim: true,
    },
    moduloNombre: {
      type: String,
      default: undefined,
      trim: true,
    },
    openedByUserId: {
      type: String,
      required: [true, "El usuario de apertura es obligatorio"],
      trim: true,
      index: true,
    },
    openedByUserName: {
      type: String,
      default: undefined,
      trim: true,
    },
    status: {
      type: String,
      required: [true, "El status es obligatorio"],
      enum: ["open", "closed", "reconciled", "cancelled"],
      index: true,
    },
    openingAmount: {
      type: Number,
      required: [true, "El fondo inicial es obligatorio"],
      min: [0, "El fondo inicial no puede ser negativo"],
    },
    openedAt: {
      type: Number,
      required: [true, "La fecha de apertura es obligatoria"],
      index: true,
    },
    closedAt: {
      type: Number,
      default: undefined,
    },
    closingAmountExpected: {
      type: Number,
      default: undefined,
    },
    closingAmountCounted: {
      type: Number,
      default: undefined,
    },
    differenceAmount: {
      type: Number,
      default: undefined,
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

cashRegisterShiftSchema.index({ moduloId: 1, status: 1 });
cashRegisterShiftSchema.index({ openedByUserId: 1, status: 1 });
cashRegisterShiftSchema.index({ proyectoId: 1, openedAt: -1 });

export const CashRegisterShiftModel = model(
  "CashRegisterShift",
  cashRegisterShiftSchema,
);
