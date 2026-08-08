import { Schema, model } from "mongoose";

const pensionPassSchema = new Schema(
    {
        usuario: {
            type: Schema.Types.ObjectId,
            ref: "Usuario",
            required: false,
        },
        name: {
            type: String,
            required: [true, "El nombre es obligatorio"],
            trim: true,
        },
        pension: {
            type: Schema.Types.ObjectId,
            ref: "Pension",
            required: [true, "La pension es obligatoria"],
        },
        idPass: {
            type: String,
            required: [true, "El id del pension-pass es obligatorio"],
            trim: true,
        },
        vigent: {
            type: Boolean,
            default: false,
        },
        antiPassback: {
            type: Boolean,
            default: true,
        },
        inParking: {
            type: Boolean,
            default: false,
        },
        created: {
            type: Number,
            required: [true, "El timestamp de creacion es necesario"],
        },
        from: {
            type: Number,
            default: -1,
        },
        to: {
            type: Number,
            default: -1,
        },
        estado: {
            type: Boolean,
            default: true,
        },
        financialOperations: {
            type: [{
                _id: false,
                key: { type: String, required: true, trim: true },
                type: { type: String, enum: ["precontract", "contract", "renew"], required: true },
                months: { type: Number, default: 0 },
                from: { type: Number, required: true },
                to: { type: Number, required: true },
                processedAt: { type: Number, required: true },
            }],
            default: [],
        },
        cancelledAt: { type: Number, default: undefined },
        cancelledBy: { type: Schema.Types.ObjectId, ref: "Usuario", default: undefined },
        cancellationReason: { type: String, default: "", trim: true },
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

pensionPassSchema.index({ idPass: 1 }, { unique: true });
pensionPassSchema.index(
    { usuario: 1, pension: 1 },
    { unique: true, partialFilterExpression: { usuario: { $type: "objectId" }, estado: true } },
);
pensionPassSchema.index({ "financialOperations.key": 1 }, { unique: true, sparse: true });

export const PensionPassModel = model("PensionPass", pensionPassSchema);
