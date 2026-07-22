import { Schema, model } from "mongoose";
import {
  AUTH_ROLES,
  AUTH_ROLE_VALUES,
  AVAILABLE_USER_MODULES,
} from "../../../../domain/constants";

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
    emailValidated: {
      type: Boolean,
      default: false,
    },
    emailValidationToken: {
      type: String,
      default: undefined,
    },
    emailValidationExpiresAt: {
      type: Date,
      default: undefined,
    },
    telefono: {
      type: String,
      required: [true, "El teléfono es obligatorio"],
      unique: true,
      trim: true,
    },
    coordinates: {
      type: [Number],
      required: false,
    },
    password: {
      type: String,
      required: [true, "La contraseña es obligatoria"],
    },
    passwordResetToken: {
      type: String,
      default: undefined,
    },
    passwordResetExpiresAt: {
      type: Date,
      default: undefined,
    },
    rol: {
      type: String,
      required: true,
      default: AUTH_ROLES.CLIENT,
      enum: AUTH_ROLE_VALUES,
    },
    parkings: {
      type: [String],
      default: [],
    },
    permissionProfileId: {
      type: String,
      default: undefined,
    },
    modules: {
      type: [String],
      default: AVAILABLE_USER_MODULES,
      enum: AVAILABLE_USER_MODULES,
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
        delete serialized.emailValidationToken;
        delete serialized.emailValidationExpiresAt;
        delete serialized.passwordResetToken;
        delete serialized.passwordResetExpiresAt;
        return serialized;
      },
    },
  },
);

export const UsuarioModel = model("Usuario", usuarioSchema);
