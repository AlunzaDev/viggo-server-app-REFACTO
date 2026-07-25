import { Schema, model } from "mongoose";

const moduloSubmoduloSchema = new Schema(
  {
    submoduloId: { type: String, required: false, trim: true },
    nombre: { type: String, required: true, trim: true },
    tipo: {
      type: String,
      required: true,
      enum: [
        "QR_SCANNER",
        "PRINTER",
        "BARRIER",
        "CAMERA",
        "CASH_DRAWER",
        "CASH_ACCEPTOR",
        "DISPLAY",
        "KEYPAD",
        "OTHER",
      ],
      default: "OTHER",
    },
    identificador: { type: String, default: "", trim: true },
    ip: { type: String, default: "", trim: true },
    mac: { type: String, default: "", trim: true },
    descripcion: { type: String, default: "", trim: true },
    estado: { type: Boolean, default: true },
  },
  { versionKey: false },
);

const moduloSchema = new Schema(
  {
    nombre: { type: String, required: true, trim: true },
    proyecto: {
      type: Schema.Types.ObjectId,
      ref: "Proyecto",
      required: true,
      index: true,
    },
    tipo: {
      type: String,
      required: true,
      enum: ["ENTRADA", "SALIDA", "POS"],
      index: true,
    },
    estado: { type: Boolean, default: true, index: true },
    identificador: { type: String, required: true, trim: true, unique: true },
    descripcion: { type: String, default: "", trim: true },
    submodulos: { type: [moduloSubmoduloSchema], default: [] },
  },
  {
    versionKey: false,
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        const serialized = ret as Record<string, unknown>;
        serialized.id = String(serialized._id);
        delete serialized._id;
        return serialized;
      },
    },
  },
);

moduloSchema.index({ proyecto: 1, tipo: 1, estado: 1 });

export const ModuloModel = model("Modulo", moduloSchema);
