import { Schema, model } from "mongoose";

const proveedorSchema = new Schema(
    {
        nombre: {
            type: String,
            required: true,
        },
        idProveedor: {
            type: Number,
            required: true,
            unique: true,
            index: true,
        },
        url: {
            type: String,
            required: false,
        },
    },
    {
        versionKey: false,
    },
);

export const ProveedorModel = model("Proveedor", proveedorSchema);
