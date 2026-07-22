import { Schema, model } from "mongoose";

const denominationLineSchema = new Schema(
  {
    label: {
      type: String,
      required: [true, "La etiqueta es obligatoria"],
      trim: true,
    },
    value: {
      type: Number,
      required: [true, "El valor es obligatorio"],
      min: [0, "El valor no puede ser negativo"],
    },
    quantity: {
      type: Number,
      required: [true, "La cantidad es obligatoria"],
      min: [0, "La cantidad no puede ser negativa"],
    },
    subtotal: {
      type: Number,
      required: [true, "El subtotal es obligatorio"],
      min: [0, "El subtotal no puede ser negativo"],
    },
  },
  {
    _id: false,
    versionKey: false,
  },
);

const cashRegisterCountSchema = new Schema(
  {
    shiftId: {
      type: String,
      required: [true, "El turno es obligatorio"],
      trim: true,
      index: true,
    },
    countedByUserId: {
      type: String,
      required: [true, "El usuario es obligatorio"],
      trim: true,
    },
    countedByUserName: {
      type: String,
      default: undefined,
      trim: true,
    },
    countedAt: {
      type: Number,
      required: [true, "La fecha es obligatoria"],
      index: true,
    },
    denominations: {
      type: [denominationLineSchema],
      required: [true, "El desglose es obligatorio"],
      default: [],
    },
    totalAmount: {
      type: Number,
      required: [true, "El total contado es obligatorio"],
      min: [0, "El total contado no puede ser negativo"],
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

cashRegisterCountSchema.index({ shiftId: 1, countedAt: -1 });

export const CashRegisterCountModel = model(
  "CashRegisterCount",
  cashRegisterCountSchema,
);
