import { Schema, model } from "mongoose";

const deviceBindingSchema = new Schema(
    {
        fingerprint: {
            type: String,
            required: [true, "El fingerprint es obligatorio"],
            trim: true,
        },
        cpuSerial: {
            type: String,
            default: "",
            trim: true,
        },
        machineId: {
            type: String,
            default: "",
            trim: true,
        },
        primaryMac: {
            type: String,
            default: "",
            trim: true,
        },
        deviceSecretHash: {
            type: String,
            default: "",
            trim: true,
        },
        deviceSecretIssuedAt: {
            type: Date,
            default: null,
        },
        boundAt: {
            type: Date,
            required: [true, "La fecha de vinculacion es obligatoria"],
        },
        lastSeenAt: {
            type: Date,
            required: [true, "La fecha de ultima conexion es obligatoria"],
        },
    },
    {
        _id: false,
        versionKey: false,
    },
);

const deviceBindingRequestSchema = new Schema(
    {
        fingerprint: {
            type: String,
            required: [true, "El fingerprint es obligatorio"],
            trim: true,
        },
        cpuSerial: {
            type: String,
            default: "",
            trim: true,
        },
        machineId: {
            type: String,
            default: "",
            trim: true,
        },
        primaryMac: {
            type: String,
            default: "",
            trim: true,
        },
        ipAddress: {
            type: String,
            default: "",
            trim: true,
        },
        locationLabel: {
            type: String,
            default: "",
            trim: true,
        },
        status: {
            type: String,
            enum: ["PENDING", "APPROVED", "REJECTED"],
            required: [true, "El status es obligatorio"],
        },
        requestedAt: {
            type: Number,
            required: [true, "La fecha de solicitud es obligatoria"],
        },
        resolvedAt: {
            type: Number,
            default: null,
        },
        notes: {
            type: String,
            default: "",
            trim: true,
        },
    },
    {
        _id: false,
        versionKey: false,
    },
);

const deviceConnectionAuditSchema = new Schema(
    {
        fingerprint: {
            type: String,
            default: "",
            trim: true,
        },
        cpuSerial: {
            type: String,
            default: "",
            trim: true,
        },
        machineId: {
            type: String,
            default: "",
            trim: true,
        },
        primaryMac: {
            type: String,
            default: "",
            trim: true,
        },
        ipAddress: {
            type: String,
            default: "",
            trim: true,
        },
        locationLabel: {
            type: String,
            default: "",
            trim: true,
        },
        socketId: {
            type: String,
            default: "",
            trim: true,
        },
        status: {
            type: String,
            enum: ["APPROVED", "PENDING", "REJECTED"],
            default: "PENDING",
        },
        reason: {
            type: String,
            default: "",
            trim: true,
        },
        attemptedAt: {
            type: Number,
            default: null,
        },
    },
    {
        _id: false,
        versionKey: false,
    },
);

const deviceRuntimeSchema = new Schema(
    {
        fingerprint: {
            type: String,
            default: "",
            trim: true,
        },
        socketId: {
            type: String,
            default: "",
            trim: true,
        },
        ipAddress: {
            type: String,
            default: "",
            trim: true,
        },
        locationLabel: {
            type: String,
            default: "",
            trim: true,
        },
        connectionStatus: {
            type: String,
            enum: ["CONNECTED", "DISCONNECTED", "PENDING", "REJECTED", "MISMATCH"],
            default: "DISCONNECTED",
        },
        isConnected: {
            type: Boolean,
            default: false,
        },
        isAuthorized: {
            type: Boolean,
            default: false,
        },
        connectedAt: {
            type: Date,
            default: null,
        },
        lastHeartbeatAt: {
            type: Date,
            default: null,
        },
        lastDisconnectAt: {
            type: Date,
            default: null,
        },
        message: {
            type: String,
            default: "",
            trim: true,
        },
    },
    {
        _id: false,
        versionKey: false,
    },
);

const moduloSchema = new Schema(
    {
        nombre: {
            type: String,
            required: [true, "El nombre es obligatorio"],
            trim: true,
        },
        proyecto: {
            type: Schema.Types.ObjectId,
            ref: "Proyecto",
            required: [true, "El proyecto es obligatorio"],
        },
        tipo: {
            type: String,
            required: [true, "El tipo es obligatorio"],
            enum: ["ENTRADA", "SALIDA", "POS"],
        },
        estado: {
            type: Boolean,
            default: true,
        },
        identificador: {
            type: String,
            required: [true, "El identificador es obligatorio"],
            trim: true,
        },
        descripcion: {
            type: String,
            required: false,
            default: "",
        },
        deviceBinding: {
            type: deviceBindingSchema,
            required: false,
            default: null,
        },
        deviceBindingRequests: {
            type: [deviceBindingRequestSchema],
            required: false,
            default: [],
        },
        deviceConnectionAudit: {
            type: deviceConnectionAuditSchema,
            required: false,
            default: null,
        },
        deviceRuntime: {
            type: deviceRuntimeSchema,
            required: false,
            default: null,
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

export const ModuloModel = model("Modulo", moduloSchema);

/** FINGEER PRINT GENERATION
cpu_serial = _read_cpu_serial()
machine_id = _read_machine_id()
primary_mac = _read_primary_mac()

raw_identity = f"{cpu_serial}|{machine_id}|{primary_mac}"
fingerprint = hashlib.sha256(raw_identity.encode("utf-8")).hexdigest()
 */
