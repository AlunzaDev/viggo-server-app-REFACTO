import { Schema, model } from "mongoose";

const ticketSchema = new Schema(
    {
        proyecto: {
            type: Schema.Types.ObjectId,
            ref: "Proyecto",
            required: [true, "El proyecto es obligatorio"],
        },
        entrada: {
            type: Schema.Types.ObjectId,
            ref: "Modulo",
            required: [true, "El modulo de entrada es obligatorio"],
        },
        usuario: {
            type: Schema.Types.ObjectId,
            ref: "Usuario",
            required: [true, "El usuario es obligatorio"],
        },
        idBoleto: {
            type: String,
            required: [true, "El numero de ticket es obligatorio"],
            trim: true,
        },
        horaInicio: {
            type: Number,
            required: [true, "La hora de inicio es obligatoria"],
        },
        salida: {
            type: Schema.Types.ObjectId,
            ref: "Modulo",
            required: false,
        },
        horaConsulta: {
            type: Number,
            default: -1,
        },
        horaCobro: {
            type: Number,
            default: -1,
        },
        horaSalida: {
            type: Number,
            default: -1,
        },
        duracion: {
            type: Number,
            default: 0,
        },
        monto: {
            type: Number,
            default: 0,
        },
        pagado: {
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
                return serialized;
            },
        },
    },
);

export const TicketModel = model("Ticket", ticketSchema);