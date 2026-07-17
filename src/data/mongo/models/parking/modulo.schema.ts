import { Schema, model } from "mongoose";

const deviceBindingSchema = new Schema(
    {
        fingerprint: {
            type: String,
            required: [true, "El fingerprint es obligatorio"],
            trim: true,
        },
        cpuSerial: {
            type: String,
            default: "",
            trim: true,
        },
        machineId: {
            type: String,
            default: "",
            trim: true,
        },
        primaryMac: {
            type: String,
            default: "",
            trim: true,
        },
        boundAt: {
            type: Date,
            required: [true, "La fecha de vinculacion es obligatoria"],
        },
        lastSeenAt: {
            type: Date,
            required: [true, "La fecha de ultima conexion es obligatoria"],
        },
    },
    {
        _id: false,
        versionKey: false,
    },
);

const deviceBindingRequestSchema = new Schema(
    {
        fingerprint: {
            type: String,
            required: [true, "El fingerprint es obligatorio"],
            trim: true,
        },
        cpuSerial: {
            type: String,
            default: "",
            trim: true,
        },
        machineId: {
            type: String,
            default: "",
            trim: true,
        },
        primaryMac: {
            type: String,
            default: "",
            trim: true,
        },
        status: {
            type: String,
            enum: ["PENDING", "APPROVED", "REJECTED"],
            required: [true, "El status es obligatorio"],
        },
        requestedAt: {
            type: Date,
            required: [true, "La fecha de solicitud es obligatoria"],
        },
        resolvedAt: {
            type: Date,
            default: null,
        },
        notes: {
            type: String,
            default: "",
            trim: true,
        },
    },
    {
        _id: false,
        versionKey: false,
    },
);

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
        deviceBinding: {
            type: deviceBindingSchema,
            required: false,
            default: null,
        },
        deviceBindingRequests: {
            type: [deviceBindingRequestSchema],
            required: false,
            default: [],
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
