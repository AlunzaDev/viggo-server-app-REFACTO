import { Schema, model } from "mongoose";

const operationalIncidentSchema = new Schema(
  {
    incidentKey: { type: String, required: true, unique: true, trim: true },
    type: { type: String, required: true, index: true, trim: true },
    status: { type: String, enum: ["open", "resolved"], required: true, index: true },
    severity: { type: String, enum: ["info", "warning", "critical"], required: true, index: true },
    source: { type: String, required: true, trim: true },
    projectId: { type: String, default: "", index: true, trim: true },
    installationId: { type: String, default: "", index: true, trim: true },
    operationId: { type: String, default: "", trim: true },
    paymentId: { type: String, default: "", trim: true },
    message: { type: String, required: true, trim: true },
    metadata: { type: Schema.Types.Mixed, required: false, default: undefined },
    openedAt: { type: Number, required: true },
    lastSeenAt: { type: Number, required: true, index: true },
    resolvedAt: { type: Number, required: false },
  },
  { versionKey: false },
);

operationalIncidentSchema.index({ status: 1, lastSeenAt: -1 });

export const OperationalIncidentModel = model(
  "OperationalIncident",
  operationalIncidentSchema,
);
