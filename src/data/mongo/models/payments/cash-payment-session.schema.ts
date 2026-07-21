import { Schema, model } from "mongoose";

const cashPaymentSessionEventSchema = new Schema(
  {
    type: {
      type: String,
      required: [true, "El tipo de evento es obligatorio"],
      enum: [
        "session_created",
        "qr_resolved",
        "cash_inserted",
        "cash_rejected",
        "change_calculated",
        "session_completed",
        "session_cancelled",
        "session_expired",
        "session_failed",
      ],
    },
    amount: {
      type: Number,
      default: null,
    },
    payload: {
      type: Schema.Types.Mixed,
      default: undefined,
    },
    createdAt: {
      type: Number,
      required: [true, "La fecha del evento es obligatoria"],
    },
  },
  {
    _id: false,
    versionKey: false,
  },
);

const cashPaymentSessionSchema = new Schema(
  {
    ticketId: {
      type: String,
      required: [true, "El ticketId es obligatorio"],
      index: true,
      trim: true,
    },
    idBoleto: {
      type: String,
      required: [true, "El idBoleto es obligatorio"],
      index: true,
      trim: true,
    },
    status: {
      type: String,
      required: [true, "El status es obligatorio"],
      enum: [
        "created",
        "pending_cash",
        "partially_paid",
        "paid",
        "cancelled",
        "expired",
        "failed",
      ],
      index: true,
    },
    amountExpected: {
      type: Number,
      required: [true, "El monto esperado es obligatorio"],
      min: [0, "El monto esperado no puede ser negativo"],
    },
    amountReceived: {
      type: Number,
      required: [true, "El monto recibido es obligatorio"],
      default: 0,
      min: [0, "El monto recibido no puede ser negativo"],
    },
    changeAmount: {
      type: Number,
      required: [true, "El cambio es obligatorio"],
      default: 0,
      min: [0, "El cambio no puede ser negativo"],
    },
    moduloId: {
      type: String,
      required: [true, "El moduloId es obligatorio"],
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
    deviceId: {
      type: String,
      default: undefined,
      trim: true,
      index: true,
    },
    startedAt: {
      type: Number,
      required: [true, "La fecha de inicio es obligatoria"],
      index: true,
    },
    completedAt: {
      type: Number,
      default: undefined,
    },
    cancelledAt: {
      type: Number,
      default: undefined,
    },
    events: {
      type: [cashPaymentSessionEventSchema],
      default: [],
    },
  },
  {
    versionKey: false,
    timestamps: false,
  },
);

cashPaymentSessionSchema.index({ ticketId: 1, status: 1 });
cashPaymentSessionSchema.index({ idBoleto: 1, status: 1 });
cashPaymentSessionSchema.index({ startedAt: -1 });

export const CashPaymentSessionModel = model(
  "CashPaymentSession",
  cashPaymentSessionSchema,
);
