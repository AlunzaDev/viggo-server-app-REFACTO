import { Schema, model } from "mongoose";

const pensionSchema = new Schema(
    {
        proyecto: {
            type: Schema.Types.ObjectId,
            ref: "Proyecto",
            required: [true, "El proyecto es obligatorio"],
        },
        nombre: {
            type: String,
            required: [true, "El nombre es obligatorio"],
            trim: true,
        },
        validez: {
            type: [
                {
                    weekDay: {
                        type: Number,
                        required: [true, "El numero de dia es necesario"],
                    },
                    from: {
                        type: [Number],
                        required: [true, "La hora de inicio es necesaria"],
                        validate: [
                            (from: number[]) => from.length === 2,
                            "From debe contener 2 elementos [HOUR, MINUTES]",
                        ],
                    },
                    to: {
                        type: [Number],
                        required: [true, "La hora de fin es necesaria"],
                        validate: [
                            (to: number[]) => to.length === 2,
                            "To debe contener 2 elementos [HOUR, MINUTES]",
                        ],
                    },
                },
            ],
            required: [true, "La validez es obligatoria"],
            validate: [
                (validez: Array<unknown>) => validez.length === 7,
                "La validez debe contener un elemento por cada dia de la semana",
            ],
        },
        precio: {
            type: Number,
            required: [true, "El precio de la pension es obligatorio"],
        },
        descripcion: {
            type: String,
            required: false,
            default: "",
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

export const PensionModel = model("Pension", pensionSchema);