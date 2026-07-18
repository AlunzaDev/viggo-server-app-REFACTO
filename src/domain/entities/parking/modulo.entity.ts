import { CustomError } from "../../errors/custom.error";

export type ModuloTipo = "ENTRADA" | "SALIDA" | "POS";

export interface ModuloDeviceBinding {
    fingerprint: string;
    cpuSerial?: string;
    machineId?: string;
    primaryMac?: string;
    deviceSecretHash?: string;
    deviceSecretIssuedAt?: Date;
    boundAt: Date;
    lastSeenAt: Date;
}

export type ModuloDeviceBindingRequestStatus =
    | "PENDING"
    | "APPROVED"
    | "REJECTED";

export interface ModuloDeviceBindingRequest {
    fingerprint: string;
    cpuSerial?: string;
    machineId?: string;
    primaryMac?: string;
    ipAddress?: string;
    locationLabel?: string;
    status: ModuloDeviceBindingRequestStatus;
    requestedAt: Date;
    resolvedAt?: Date;
    notes?: string;
}

export type ModuloDeviceConnectionAuditStatus =
    | "APPROVED"
    | "PENDING"
    | "REJECTED";

export type ModuloDeviceRuntimeConnectionStatus =
    | "CONNECTED"
    | "DISCONNECTED"
    | "PENDING"
    | "REJECTED"
    | "MISMATCH";

export interface ModuloDeviceConnectionAudit {
    fingerprint?: string;
    cpuSerial?: string;
    machineId?: string;
    primaryMac?: string;
    ipAddress?: string;
    locationLabel?: string;
    socketId?: string;
    status: ModuloDeviceConnectionAuditStatus;
    reason?: string;
    attemptedAt: Date;
}

export interface ModuloDeviceRuntime {
    fingerprint?: string;
    socketId?: string;
    ipAddress?: string;
    locationLabel?: string;
    connectionStatus: ModuloDeviceRuntimeConnectionStatus;
    isConnected: boolean;
    isAuthorized: boolean;
    connectedAt?: Date;
    lastHeartbeatAt?: Date;
    lastDisconnectAt?: Date;
    message?: string;
}

export interface ModuloEntityOptions {
    id: string;
    nombre: string;
    proyecto: string;
    tipo: ModuloTipo;
    estado: boolean;
    identificador: string;
    descripcion?: string;
    deviceBinding?: ModuloDeviceBinding | null;
    deviceBindingRequests?: ModuloDeviceBindingRequest[];
    deviceConnectionAudit?: ModuloDeviceConnectionAudit | null;
    deviceRuntime?: ModuloDeviceRuntime | null;
}

export class ModuloEntity {
    public id: string;
    public nombre: string;
    public proyecto: string;
    public tipo: ModuloTipo;
    public estado: boolean;
    public identificador: string;
    public descripcion?: string;
    public deviceBinding?: ModuloDeviceBinding | null;
    public deviceBindingRequests: ModuloDeviceBindingRequest[];
    public deviceConnectionAudit?: ModuloDeviceConnectionAudit | null;
    public deviceRuntime?: ModuloDeviceRuntime | null;

    constructor(options: ModuloEntityOptions) {
        const {
            id,
            nombre,
            proyecto,
            tipo,
            estado,
            identificador,
            descripcion,
            deviceBinding,
            deviceBindingRequests,
            deviceConnectionAudit,
            deviceRuntime,
        } = options;

        this.id = id;
        this.nombre = nombre;
        this.proyecto = proyecto;
        this.tipo = tipo;
        this.estado = estado;
        this.identificador = identificador;
        this.descripcion = descripcion;
        this.deviceBinding = deviceBinding ?? null;
        this.deviceBindingRequests = deviceBindingRequests ?? [];
        this.deviceConnectionAudit = deviceConnectionAudit ?? null;
        this.deviceRuntime = deviceRuntime ?? null;
    }

    static fromObject(object: { [key: string]: unknown }): ModuloEntity {
        const {
            _id,
            id,
            nombre,
            proyecto,
            tipo,
            estado,
            identificador,
            descripcion,
            deviceBinding,
            deviceBindingRequests,
            deviceConnectionAudit,
            deviceRuntime,
        } = object;

        const moduloId = id || (_id ? String(_id) : undefined);

        if (!moduloId) throw CustomError.badRequest("Missing id");
        if (!nombre) throw CustomError.badRequest("Missing nombre");
        if (!proyecto) throw CustomError.badRequest("Missing proyecto");
        if (!tipo) throw CustomError.badRequest("Missing tipo");
        if (estado === undefined || estado === null) {
            throw CustomError.badRequest("Missing estado");
        }
        if (!identificador) throw CustomError.badRequest("Missing identificador");

        return new ModuloEntity({
            id: String(moduloId),
            nombre: String(nombre).trim(),
            proyecto: String(proyecto),
            tipo: String(tipo) as ModuloTipo,
            estado: Boolean(estado),
            identificador: String(identificador).trim(),
            descripcion: typeof descripcion === "string" ? descripcion : undefined,
            deviceBinding: parseDeviceBinding(deviceBinding),
            deviceBindingRequests: parseDeviceBindingRequests(deviceBindingRequests),
            deviceConnectionAudit: parseDeviceConnectionAudit(deviceConnectionAudit),
            deviceRuntime: parseDeviceRuntime(deviceRuntime),
        });
    }
}

function parseDeviceBinding(value: unknown): ModuloDeviceBinding | null {
    if (!value || typeof value !== "object") {
        return null;
    }

    const binding = value as Record<string, unknown>;
    const fingerprint = String(binding.fingerprint ?? "").trim();

    if (!fingerprint) {
        return null;
    }

    return {
        fingerprint,
        cpuSerial: String(binding.cpuSerial ?? "").trim() || undefined,
        machineId: String(binding.machineId ?? "").trim() || undefined,
        primaryMac: String(binding.primaryMac ?? "").trim() || undefined,
        deviceSecretHash: String(binding.deviceSecretHash ?? "").trim() || undefined,
        deviceSecretIssuedAt:
            binding.deviceSecretIssuedAt === undefined ||
            binding.deviceSecretIssuedAt === null
                ? undefined
                : toDate(
                      binding.deviceSecretIssuedAt,
                      "deviceBinding.deviceSecretIssuedAt",
                  ),
        boundAt: toDate(binding.boundAt, "deviceBinding.boundAt"),
        lastSeenAt: toDate(binding.lastSeenAt, "deviceBinding.lastSeenAt"),
    };
}

function toDate(value: unknown, fieldName: string): Date {
    const date =
        value instanceof Date
            ? value
            : typeof value === "number"
              ? new Date(value)
              : new Date(String(value ?? ""));

    if (Number.isNaN(date.getTime())) {
        throw CustomError.badRequest(`Invalid ${fieldName}`);
    }

    return date;
}

function parseDeviceBindingRequests(
    value: unknown,
): ModuloDeviceBindingRequest[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((item) => parseDeviceBindingRequest(item))
        .filter((item): item is ModuloDeviceBindingRequest => item !== null);
}

function parseDeviceBindingRequest(
    value: unknown,
): ModuloDeviceBindingRequest | null {
    if (!value || typeof value !== "object") {
        return null;
    }

    const request = value as Record<string, unknown>;
    const fingerprint = String(request.fingerprint ?? "").trim();
    const status = String(request.status ?? "").trim().toUpperCase();

    if (!fingerprint || !isValidRequestStatus(status)) {
        return null;
    }

    const resolvedAtValue = request.resolvedAt;

    return {
        fingerprint,
        cpuSerial: String(request.cpuSerial ?? "").trim() || undefined,
        machineId: String(request.machineId ?? "").trim() || undefined,
        primaryMac: String(request.primaryMac ?? "").trim() || undefined,
        ipAddress: String(request.ipAddress ?? "").trim() || undefined,
        locationLabel: String(request.locationLabel ?? "").trim() || undefined,
        status,
        requestedAt: toDate(request.requestedAt, "deviceBindingRequests.requestedAt"),
        resolvedAt:
            resolvedAtValue === undefined || resolvedAtValue === null
                ? undefined
                : toDate(resolvedAtValue, "deviceBindingRequests.resolvedAt"),
        notes: String(request.notes ?? "").trim() || undefined,
    };
}

function isValidRequestStatus(
    value: string,
): value is ModuloDeviceBindingRequestStatus {
    return value === "PENDING" || value === "APPROVED" || value === "REJECTED";
}

function parseDeviceConnectionAudit(
    value: unknown,
): ModuloDeviceConnectionAudit | null {
    if (!value || typeof value !== "object") {
        return null;
    }

    const audit = value as Record<string, unknown>;
    const status = String(audit.status ?? "").trim().toUpperCase();

    if (!isValidConnectionAuditStatus(status)) {
        return null;
    }

    return {
        fingerprint: String(audit.fingerprint ?? "").trim() || undefined,
        cpuSerial: String(audit.cpuSerial ?? "").trim() || undefined,
        machineId: String(audit.machineId ?? "").trim() || undefined,
        primaryMac: String(audit.primaryMac ?? "").trim() || undefined,
        ipAddress: String(audit.ipAddress ?? "").trim() || undefined,
        locationLabel: String(audit.locationLabel ?? "").trim() || undefined,
        socketId: String(audit.socketId ?? "").trim() || undefined,
        status,
        reason: String(audit.reason ?? "").trim() || undefined,
        attemptedAt: toDate(audit.attemptedAt, "deviceConnectionAudit.attemptedAt"),
    };
}

function parseDeviceRuntime(value: unknown): ModuloDeviceRuntime | null {
    if (!value || typeof value !== "object") {
        return null;
    }

    const runtime = value as Record<string, unknown>;
    const connectionStatus = String(runtime.connectionStatus ?? "")
        .trim()
        .toUpperCase();

    if (!isValidRuntimeConnectionStatus(connectionStatus)) {
        return null;
    }

    return {
        fingerprint: String(runtime.fingerprint ?? "").trim() || undefined,
        socketId: String(runtime.socketId ?? "").trim() || undefined,
        ipAddress: String(runtime.ipAddress ?? "").trim() || undefined,
        locationLabel: String(runtime.locationLabel ?? "").trim() || undefined,
        connectionStatus,
        isConnected: Boolean(runtime.isConnected),
        isAuthorized: Boolean(runtime.isAuthorized),
        connectedAt:
            runtime.connectedAt === undefined || runtime.connectedAt === null
                ? undefined
                : toDate(runtime.connectedAt, "deviceRuntime.connectedAt"),
        lastHeartbeatAt:
            runtime.lastHeartbeatAt === undefined || runtime.lastHeartbeatAt === null
                ? undefined
                : toDate(
                      runtime.lastHeartbeatAt,
                      "deviceRuntime.lastHeartbeatAt",
                  ),
        lastDisconnectAt:
            runtime.lastDisconnectAt === undefined || runtime.lastDisconnectAt === null
                ? undefined
                : toDate(
                      runtime.lastDisconnectAt,
                      "deviceRuntime.lastDisconnectAt",
                  ),
        message: String(runtime.message ?? "").trim() || undefined,
    };
}

function isValidConnectionAuditStatus(
    value: string,
): value is ModuloDeviceConnectionAuditStatus {
    return value === "APPROVED" || value === "PENDING" || value === "REJECTED";
}

function isValidRuntimeConnectionStatus(
    value: string,
): value is ModuloDeviceRuntimeConnectionStatus {
    return (
        value === "CONNECTED" ||
        value === "DISCONNECTED" ||
        value === "PENDING" ||
        value === "REJECTED" ||
        value === "MISMATCH"
    );
}

/** FINGER PRINT GENERATION
cpu_serial = _read_cpu_serial()
machine_id = _read_machine_id()
primary_mac = _read_primary_mac()

raw_identity = f"{cpu_serial}|{machine_id}|{primary_mac}"
fingerprint = hashlib.sha256(raw_identity.encode("utf-8")).hexdigest()
 */
