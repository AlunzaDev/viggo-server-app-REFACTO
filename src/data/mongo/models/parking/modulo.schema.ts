import { Schema, model } from "mongoose";

const moduloSchema = new Schema(
    {
        nombre: {
            type: String,
            required: [true, "El nombre es obligatorio"],
            trim: true,
        },
        proyecto: {
            type: Schema.Types.ObjectId,
            ref: "Proyecto",
            required: [true, "El proyecto es obligatorio"],
        },
        tipo: {
            type: String,
            required: [true, "El tipo es obligatorio"],
            enum: ["ENTRADA", "SALIDA", "POS"],
        },
        estado: {
            type: Boolean,
            default: true,
        },
        identificador: {
            type: String,
            required: [true, "El identificador es obligatorio"],
            trim: true,
        },
        descripcion: {
            type: String,
            required: false,
            default: "",
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

export const ModuloModel = model("Modulo", moduloSchema);