import { Schema, model } from "mongoose";

const counterSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    seq: { type: Number, required: true, default: 0 },
  },
  { versionKey: false },
);

export const CounterModel = model("Counter", counterSchema);
