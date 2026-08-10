import { Schema, model } from "mongoose";

const moduloSubmoduloSchema = new Schema(
  {
    submoduloId: { type: String, required: false, trim: true },
    nombre: { type: String, required: true, trim: true },
    tipo: {
      type: String,
      required: true,
      enum: [
        "QR_SCANNER",
        "PRINTER",
        "BARRIER",
        "CAMERA",
        "CASH_DRAWER",
        "CASH_ACCEPTOR",
        "DISPLAY",
        "KEYPAD",
        "OTHER",
      ],
      default: "OTHER",
    },
    identificador: { type: String, default: "", trim: true },
    ip: { type: String, default: "", trim: true },
    mac: { type: String, default: "", trim: true },
    ubicacion: { type: String, default: "", trim: true },
    coordinates: {
      type: [Number],
      default: [],
      validate: {
        validator: (value: unknown) =>
          !Array.isArray(value) ||
          value.length === 0 ||
          (value.length === 2 &&
            Number.isFinite(Number(value[0])) &&
            Number.isFinite(Number(value[1]))),
        message: "coordinates debe contener [lon,lat]",
      },
    },
    descripcion: { type: String, default: "", trim: true },
    estado: { type: Boolean, default: true },
  },
  { versionKey: false },
);

const moduloDeviceBindingSchema = new Schema(
  {
    fingerprint: { type: String, required: true, trim: true },
    cpuSerial: { type: String, default: "", trim: true },
    machineId: { type: String, default: "", trim: true },
    primaryMac: { type: String, default: "", trim: true },
    boundAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true },
  },
  { _id: false, versionKey: false },
);

const moduloDeviceBindingRequestSchema = new Schema(
  {
    fingerprint: { type: String, required: true, trim: true },
    cpuSerial: { type: String, default: "", trim: true },
    machineId: { type: String, default: "", trim: true },
    primaryMac: { type: String, default: "", trim: true },
    ipAddress: { type: String, default: "", trim: true },
    locationLabel: { type: String, default: "", trim: true },
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      required: true,
      default: "PENDING",
    },
    requestedAt: { type: Date, required: true },
    resolvedAt: { type: Date, required: false },
    notes: { type: String, default: "", trim: true },
  },
  { _id: false, versionKey: false },
);

const moduloDeviceConnectionAuditSchema = new Schema(
  {
    fingerprint: { type: String, default: "", trim: true },
    cpuSerial: { type: String, default: "", trim: true },
    machineId: { type: String, default: "", trim: true },
    primaryMac: { type: String, default: "", trim: true },
    ipAddress: { type: String, default: "", trim: true },
    locationLabel: { type: String, default: "", trim: true },
    socketId: { type: String, default: "", trim: true },
    status: {
      type: String,
      enum: ["APPROVED", "PENDING", "REJECTED"],
      required: true,
    },
    reason: { type: String, default: "", trim: true },
    attemptedAt: { type: Date, required: true },
  },
  { _id: false, versionKey: false },
);

const moduloDeviceRuntimeSnapshotSchema = new Schema(
  {
    fingerprint: { type: String, default: "", trim: true },
    socketId: { type: String, default: "", trim: true },
    ipAddress: { type: String, default: "", trim: true },
    locationLabel: { type: String, default: "", trim: true },
    connectionStatus: {
      type: String,
      enum: ["CONNECTED", "DISCONNECTED", "PENDING", "REJECTED", "MISMATCH"],
      default: "PENDING",
    },
    heartbeatStatus: {
      type: String,
      enum: ["online", "offline", "pending"],
      default: "pending",
    },
    isConnected: { type: Boolean, default: false },
    isAuthorized: { type: Boolean, default: false },
    connectedAt: { type: Date, required: false },
    lastHeartbeatAt: { type: Date, required: false },
    lastDisconnectAt: { type: Date, required: false },
    message: { type: String, default: "", trim: true },
    sourceInstallationId: { type: String, default: "", trim: true },
    syncedAt: { type: Date, required: false },
  },
  { _id: false, versionKey: false },
);

const moduloRemoteSupportSchema = new Schema(
  {
    provider: {
      type: String,
      enum: ["MESHCENTRAL"],
      default: "MESHCENTRAL",
    },
    enabled: { type: Boolean, default: false },
    deviceName: { type: String, default: "", trim: true },
    deviceId: { type: String, default: "", trim: true },
    groupId: { type: String, default: "", trim: true },
    baseUrl: { type: String, default: "", trim: true },
    supportUrl: { type: String, default: "", trim: true },
    desktopUrl: { type: String, default: "", trim: true },
    terminalUrl: { type: String, default: "", trim: true },
    linkedAt: { type: Date, required: false },
    updatedAt: { type: Date, required: false },
  },
  { _id: false, versionKey: false },
);

const moduloSchema = new Schema(
  {
    nombre: { type: String, required: true, trim: true },
    proyecto: {
      type: Schema.Types.ObjectId,
      ref: "Proyecto",
      required: true,
      index: true,
    },
    tipo: {
      type: String,
      required: true,
      enum: ["ENTRADA", "SALIDA", "POS"],
      index: true,
    },
    estado: { type: Boolean, default: true, index: true },
    identificador: { type: String, required: true, trim: true, unique: true },
    ip: { type: String, default: "", trim: true },
    mac: { type: String, default: "", trim: true },
    ubicacion: { type: String, default: "", trim: true },
    coordinates: {
      type: [Number],
      default: [],
      validate: {
        validator: (value: unknown) =>
          !Array.isArray(value) ||
          value.length === 0 ||
          (value.length === 2 &&
            Number.isFinite(Number(value[0])) &&
            Number.isFinite(Number(value[1]))),
        message: "coordinates debe contener [lon,lat]",
      },
    },
    descripcion: { type: String, default: "", trim: true },
    deviceBinding: {
      type: moduloDeviceBindingSchema,
      default: null,
    },
    deviceBindingRequests: {
      type: [moduloDeviceBindingRequestSchema],
      default: [],
    },
    deviceConnectionAudit: {
      type: moduloDeviceConnectionAuditSchema,
      default: null,
    },
    deviceRuntimeSnapshot: {
      type: moduloDeviceRuntimeSnapshotSchema,
      default: null,
    },
    remoteSupport: {
      type: moduloRemoteSupportSchema,
      default: null,
    },
    submodulos: { type: [moduloSubmoduloSchema], default: [] },
  },
  {
    versionKey: false,
    timestamps: true,
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

moduloSchema.index({ proyecto: 1, tipo: 1, estado: 1 });

export const ModuloModel = model("Modulo", moduloSchema);
