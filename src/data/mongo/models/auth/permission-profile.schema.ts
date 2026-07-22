import { Schema, model } from "mongoose";
import { AVAILABLE_USER_MODULES } from "../../../../domain/constants";

const permissionProfileSchema = new Schema(
  {
    nombre: {
      type: String,
      required: [true, "El nombre es obligatorio"],
      unique: true,
      trim: true,
    },
    descripcion: {
      type: String,
      default: "",
      trim: true,
    },
    modules: {
      type: [String],
      default: [],
      enum: AVAILABLE_USER_MODULES,
    },
    estado: {
      type: Boolean,
      default: true,
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

export const PermissionProfileModel = model(
  "PermissionProfile",
  permissionProfileSchema,
);
