import { Schema, model } from "mongoose";

const pensionMoveSchema = new Schema(
    {
        modulo: {
            type: Schema.Types.ObjectId,
            ref: "Modulo",
            required: [true, "El modulo es obligatorio"],
        },
        proyecto: {
            type: Schema.Types.ObjectId,
            ref: "Proyecto",
            required: [true, "El proyecto es obligatorio"],
        },
        pensionPass: {
            type: Schema.Types.ObjectId,
            ref: "PensionPass",
            required: [true, "El pension pass es obligatorio"],
        },
        tipo: {
            type: String,
            required: [true, "El tipo es obligatorio"],
            enum: ["ENTRADA", "SALIDA", "ENTRADA-PENSION", "SALIDA-PENSION"],
        },
        fecha: {
            type: Number,
            required: [true, "La fecha es obligatoria"],
        },
    },
    {
        versionKey: false,
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

export const PensionMoveModel = model("PensionMove", pensionMoveSchema);