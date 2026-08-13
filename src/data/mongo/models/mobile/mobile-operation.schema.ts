import { Schema, model } from "mongoose";

const mobileOperationSchema = new Schema(
  {
    operationId: { type: String, required: true, unique: true, trim: true },
    idempotencyKey: { type: String, required: true, unique: true, trim: true },
    type: { type: String, required: true, index: true, trim: true },
    installationId: { type: String, required: true, index: true, trim: true },
    proyectoId: { type: String, required: true, index: true, trim: true },
    userId: { type: String, required: true, index: true, trim: true },
    payload: { type: Schema.Types.Mixed, required: true, default: () => ({}) },
    result: { type: Schema.Types.Mixed, required: false, default: undefined },
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "failed", "expired", "dead_letter"],
      required: true,
      default: "pending",
      index: true,
    },
    error: { type: String, default: "", trim: true },
    attempts: { type: Number, required: true, default: 0 },
    maxAttempts: { type: Number, required: true, default: 3 },
    nextRetryAt: { type: Number, required: false, index: true },
    claimedAt: { type: Number, required: false },
    lastAttemptAt: { type: Number, required: false },
    processingDeadlineAt: { type: Number, required: false },
    completedAt: { type: Number, required: false, index: true },
    expiresAt: { type: Number, required: false, index: true },
    createdAt: { type: Number, required: true, default: Date.now, index: true },
    updatedAt: { type: Number, required: true, default: Date.now, index: true },
  },
  { versionKey: false },
);

mobileOperationSchema.index({ installationId: 1, status: 1, nextRetryAt: 1, createdAt: 1 });
mobileOperationSchema.index({ userId: 1, completedAt: -1 });

export const MobileOperationModel = model("MobileOperation", mobileOperationSchema);
