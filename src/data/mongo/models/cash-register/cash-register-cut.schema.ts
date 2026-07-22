import { Schema, model } from "mongoose";

const cashRegisterCutSchema = new Schema(
  {
    shiftId: {
      type: String,
      required: [true, "El turno es obligatorio"],
      trim: true,
      unique: true,
      index: true,
    },
    generatedByUserId: {
      type: String,
      required: [true, "El usuario es obligatorio"],
      trim: true,
    },
    generatedByUserName: {
      type: String,
      default: undefined,
      trim: true,
    },
    generatedAt: {
      type: Number,
      required: [true, "La fecha es obligatoria"],
      index: true,
    },
    openingAmount: {
      type: Number,
      required: [true, "El fondo inicial es obligatorio"],
      min: [0, "El fondo inicial no puede ser negativo"],
    },
    totalIn: {
      type: Number,
      required: [true, "El total de entradas es obligatorio"],
      min: [0, "El total de entradas no puede ser negativo"],
    },
    totalOut: {
      type: Number,
      required: [true, "El total de salidas es obligatorio"],
      min: [0, "El total de salidas no puede ser negativo"],
    },
    expectedAmount: {
      type: Number,
      required: [true, "El esperado es obligatorio"],
    },
    countedAmount: {
      type: Number,
      required: [true, "El contado es obligatorio"],
    },
    differenceAmount: {
      type: Number,
      required: [true, "La diferencia es obligatoria"],
    },
    status: {
      type: String,
      required: [true, "El status es obligatorio"],
      enum: ["balanced", "short", "over"],
      index: true,
    },
    notes: {
      type: String,
      default: undefined,
      trim: true,
    },
  },
  {
    versionKey: false,
    timestamps: false,
  },
);

export const CashRegisterCutModel = model(
  "CashRegisterCut",
  cashRegisterCutSchema,
);
