import { Schema, model } from "mongoose";

const inboxEventSchema = new Schema(
  {
    eventId: { type: String, required: true, unique: true, trim: true },
    installationId: { type: String, required: true, index: true, trim: true },
    proyectoId: { type: String, required: true, index: true, trim: true },
    eventType: { type: String, required: true, index: true, trim: true },
    aggregateId: { type: String, required: true, trim: true },
    occurredAt: { type: Number, required: true, index: true },
    payload: { type: Schema.Types.Mixed, required: true },
  },
  { versionKey: false, timestamps: true },
);

inboxEventSchema.index({ proyectoId: 1, occurredAt: -1 });

export const InboxEventModel = model("InboxEvent", inboxEventSchema);
