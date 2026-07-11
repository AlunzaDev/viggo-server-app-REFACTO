import { Schema, model } from "mongoose";
import { AUTH_ROLES, AUTH_ROLE_VALUES } from "../../../../domain/constants";

const usuarioSchema = new Schema(
    {
        nombre: {
            type: String,
            required: [true, "El nombre es obligatorio"],
            trim: true,
        },
        apellido: {
            type: String,
            required: [true, "El apellido es obligatorio"],
            trim: true,
        },
        correo: {
            type: String,
            required: [true, "El correo es obligatorio"],
            unique: true,
            trim: true,
            lowercase: true,
        },
        telefono: {
            type: String,
            required: [true, "El telefono es obligatorio"],
            unique: true,
            trim: true,
        },
        coordinates: {
            type: [Number],
            required: false,
        },
        password: {
            type: String,
            required: [true, "La contrasena es obligatoria"],
        },
        rol: {
            type: String,
            required: true,
            default: AUTH_ROLES.CLIENT,
            enum: AUTH_ROLE_VALUES,
        },
        nacimiento: {
            type: Number,
            required: false,
        },
        img: {
            type: String,
            default: "",
        },
        estado: {
            type: Boolean,
            default: true,
        },
        google: {
            type: Boolean,
            default: false,
        },
    },
    {
        versionKey: false,
        toJSON: {
            transform: (_doc, ret) => {
                const serialized = ret as Record<string, unknown>;
                serialized.id = String(serialized._id);
                delete serialized._id;
                delete serialized.password;
                return serialized;
            },
        },
    },
);

export const UsuarioModel = model("Usuario", usuarioSchema);
