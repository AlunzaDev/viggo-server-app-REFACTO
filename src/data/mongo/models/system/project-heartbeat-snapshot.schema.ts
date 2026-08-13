import { Schema, model } from "mongoose";

const projectHeartbeatSnapshotSchema = new Schema(
  {
    proyectoId: { type: String, required: true, unique: true, trim: true },
    installationId: { type: String, required: true, index: true, trim: true },
    source: { type: String, required: true, trim: true },
    generatedAt: { type: Number, required: true, index: true },
    receivedAt: { type: Number, required: true, index: true },
    summary: { type: Schema.Types.Mixed, required: true, default: () => ({}) },
    modules: { type: [Schema.Types.Mixed], required: true, default: () => [] },
    metadata: { type: Schema.Types.Mixed, required: false, default: undefined },
  },
  { versionKey: false },
);

export const ProjectHeartbeatSnapshotModel = model(
  "ProjectHeartbeatSnapshot",
  projectHeartbeatSnapshotSchema,
);
