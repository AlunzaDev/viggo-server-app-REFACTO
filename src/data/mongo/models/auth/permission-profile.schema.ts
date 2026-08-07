import { Schema, model } from "mongoose";
import {
  AVAILABLE_USER_MODULES,
  USER_APP_VALUES,
} from "../../../../domain/constants";

const permissionProfileSchema = new Schema(
  {
    app: {
      type: String,
      required: [true, "La aplicación es obligatoria"],
      enum: USER_APP_VALUES,
    },
    nombre: {
      type: String,
      required: [true, "El nombre es obligatorio"],
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

permissionProfileSchema.index(
  {
    app: 1,
    nombre: 1,
  },
  {
    unique: true,
  },
);

export const PermissionProfileModel = model(
  "PermissionProfile",
  permissionProfileSchema,
);
