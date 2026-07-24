import { Schema, model } from "mongoose";

const proyectoSchema = new Schema(
    {
        nombre: {
            type: String,
            required: [true, "El nombre es obligatorio"],
            trim: true,
        },
        coordinates: {
            type: [Number],
            required: [true, "coordinates [lon,lat] are required"],
        },
        ciudad: {
            type: String,
            required: [true, "La ciudad es obligatoria"],
            trim: true,
        },
        identificador: {
            type: String,
            required: [true, "El identificador es obligatorio"],
            unique: true,
            trim: true,
        },
        codigoProyecto: {
            type: String,
            required: false,
            unique: true,
            sparse: true,
            trim: true,
            match: [/^\d{4}$/, "El codigo de proyecto debe tener 4 digitos"],
        },
        serverIp: {
            type: String,
            required: false,
            default: "",
            trim: true,
        },
        serverMac: {
            type: String,
            required: false,
            default: "",
            trim: true,
            uppercase: true,
        },
        localApiBaseUrl: {
            type: String,
            required: false,
            default: "",
            trim: true,
        },
        installationLinkTokenHash: {
            type: String,
            required: false,
            default: "",
            trim: true,
        },
        installationLinkTokenIssuedAt: {
            type: Number,
            required: false,
            default: undefined,
        },
        img: {
            type: String,
            required: false,
            default: "",
        },
        descripcion: {
            type: String,
            required: false,
            default: "",
        },
        estado: {
            type: Boolean,
            required: false,
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
                delete serialized.installationLinkTokenHash;
                return serialized;
            },
        },
    },
);

export const ProyectoModel = model("Proyecto", proyectoSchema);
