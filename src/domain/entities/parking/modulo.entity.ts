import { CustomError } from "../../errors/custom.error";

export type ModuloTipo = "ENTRADA" | "SALIDA" | "POS";

export interface ModuloDeviceBinding {
    fingerprint: string;
    cpuSerial?: string;
    machineId?: string;
    primaryMac?: string;
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
    status: ModuloDeviceBindingRequestStatus;
    requestedAt: Date;
    resolvedAt?: Date;
    notes?: string;
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
        boundAt: toDate(binding.boundAt, "deviceBinding.boundAt"),
        lastSeenAt: toDate(binding.lastSeenAt, "deviceBinding.lastSeenAt"),
    };
}

function toDate(value: unknown, fieldName: string): Date {
    const date = value instanceof Date ? value : new Date(String(value ?? ""));

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
