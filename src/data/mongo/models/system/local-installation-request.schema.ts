import { Schema, model } from "mongoose";

const localInstallationRequestSchema = new Schema(
  {
    installationId: { type: String, required: true, unique: true, trim: true },
    proyectoId: { type: String, required: true, index: true, trim: true },
    proyectoNombre: { type: String, default: "", trim: true },
    proyectoIdentificador: { type: String, default: "", trim: true },
    localApiBaseUrl: { type: String, default: "", trim: true },
    serverIp: { type: String, default: "", trim: true },
    serverMac: { type: String, default: "", trim: true },
    browserCoordinates: { type: [Number], required: false, default: undefined },
    browserLocationAccuracy: { type: Number, required: false },
    browserLocationCapturedAt: { type: Number, required: false },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      required: true,
      default: "pending",
      index: true,
    },
    requestedByUserId: { type: String, default: "", trim: true },
    requestedByUserName: { type: String, default: "", trim: true },
    requestedAt: { type: Number, required: true, default: Date.now },
    reviewedByUserId: { type: String, default: "", trim: true },
    reviewedByUserName: { type: String, default: "", trim: true },
    reviewedAt: { type: Number, required: false },
    reviewNote: { type: String, default: "", trim: true },
    syncTokenHash: { type: String, default: "", select: false },
    syncTokenIssuedAt: { type: Number, default: 0 },
    syncTokenDeliveredAt: { type: Number, default: 0 },
    lastCommandPollAt: { type: Number, default: 0, index: true },
    updatedAt: { type: Number, required: true, default: Date.now },
  },
  { versionKey: false },
);

localInstallationRequestSchema.index({ proyectoId: 1, status: 1 });

export const LocalInstallationRequestModel = model(
  "LocalInstallationRequest",
  localInstallationRequestSchema,
);
