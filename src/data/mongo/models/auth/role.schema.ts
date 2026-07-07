import { Schema, model } from "mongoose";

const roleSchema = new Schema(
    {
        rol: {
            type: String,
            required: [true, "El rol es obligatorio"],
            unique: true,
            trim: true,
        },
    },
    {
        versionKey: false,
    },
);

export const RoleModel = model("Rol", roleSchema);