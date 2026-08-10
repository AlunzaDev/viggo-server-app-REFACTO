import { CustomError } from "../../errors/custom.error";

export type ModuloTipo = "ENTRADA" | "SALIDA" | "POS";
export const MODULO_SUBMODULO_TIPOS = [
  "QR_SCANNER",
  "PRINTER",
  "BARRIER",
  "CAMERA",
  "CASH_DRAWER",
  "CASH_ACCEPTOR",
  "DISPLAY",
  "KEYPAD",
  "OTHER",
] as const;

export type ModuloSubmoduloTipo = (typeof MODULO_SUBMODULO_TIPOS)[number];

export interface ModuloSubmodulo {
  submoduloId: string;
  nombre: string;
  tipo: ModuloSubmoduloTipo;
  identificador?: string;
  ip?: string;
  mac?: string;
  ubicacion?: string;
  coordinates?: [number, number];
  descripcion?: string;
  estado: boolean;
}

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
  ipAddress?: string;
  locationLabel?: string;
  status: ModuloDeviceBindingRequestStatus;
  requestedAt: Date;
  resolvedAt?: Date;
  notes?: string;
}

export interface ModuloDeviceRuntimeSnapshot {
  fingerprint?: string;
  socketId?: string;
  ipAddress?: string;
  locationLabel?: string;
  connectionStatus?: string;
  heartbeatStatus?: string;
  isConnected: boolean;
  isAuthorized: boolean;
  connectedAt?: Date;
  lastHeartbeatAt?: Date;
  lastDisconnectAt?: Date;
  message?: string;
  sourceInstallationId?: string;
  syncedAt?: Date;
}

export type ModuloRemoteSupportProvider = "MESHCENTRAL";

export interface ModuloRemoteSupport {
  provider: ModuloRemoteSupportProvider;
  enabled: boolean;
  deviceName?: string;
  deviceId?: string;
  groupId?: string;
  baseUrl?: string;
  supportUrl?: string;
  desktopUrl?: string;
  terminalUrl?: string;
  linkedAt?: Date;
  updatedAt?: Date;
}

export interface ModuloEntityOptions {
  id: string;
  nombre: string;
  proyecto: string;
  tipo: ModuloTipo;
  estado: boolean;
  identificador: string;
  ip?: string;
  mac?: string;
  ubicacion?: string;
  coordinates?: [number, number];
  descripcion?: string;
  deviceBinding?: ModuloDeviceBinding | null;
  deviceBindingRequests?: ModuloDeviceBindingRequest[];
  deviceRuntimeSnapshot?: ModuloDeviceRuntimeSnapshot | null;
  remoteSupport?: ModuloRemoteSupport | null;
  submodulos?: ModuloSubmodulo[];
}

export class ModuloEntity {
  public id: string;
  public nombre: string;
  public proyecto: string;
  public tipo: ModuloTipo;
  public estado: boolean;
  public identificador: string;
  public ip?: string;
  public mac?: string;
  public ubicacion?: string;
  public coordinates?: [number, number];
  public descripcion?: string;
  public deviceBinding?: ModuloDeviceBinding | null;
  public deviceBindingRequests?: ModuloDeviceBindingRequest[];
  public deviceRuntimeSnapshot?: ModuloDeviceRuntimeSnapshot | null;
  public remoteSupport?: ModuloRemoteSupport | null;
  public submodulos: ModuloSubmodulo[];

  constructor(options: ModuloEntityOptions) {
    this.id = options.id;
    this.nombre = options.nombre;
    this.proyecto = options.proyecto;
    this.tipo = options.tipo;
    this.estado = options.estado;
    this.identificador = options.identificador;
    this.ip = options.ip;
    this.mac = options.mac;
    this.ubicacion = options.ubicacion;
    this.coordinates = options.coordinates;
    this.descripcion = options.descripcion;
    this.deviceBinding = options.deviceBinding ?? null;
    this.deviceBindingRequests = options.deviceBindingRequests ?? [];
    this.deviceRuntimeSnapshot = options.deviceRuntimeSnapshot ?? null;
    this.remoteSupport = options.remoteSupport ?? null;
    this.submodulos = options.submodulos ?? [];
  }

  static fromObject(object: Record<string, unknown>): ModuloEntity {
    const id = object.id ?? (object._id ? String(object._id) : undefined);
    const tipo = String(object.tipo ?? "").trim().toUpperCase();

    if (!id) throw CustomError.badRequest("Missing id");
    if (!object.nombre) throw CustomError.badRequest("Missing nombre");
    if (!object.proyecto) throw CustomError.badRequest("Missing proyecto");
    if (tipo !== "ENTRADA" && tipo !== "SALIDA" && tipo !== "POS") {
      throw CustomError.badRequest("Invalid tipo");
    }
    if (!object.identificador) throw CustomError.badRequest("Missing identificador");

    return new ModuloEntity({
      id: String(id),
      nombre: String(object.nombre).trim(),
      proyecto: String(object.proyecto),
      tipo,
      estado: object.estado === undefined ? true : Boolean(object.estado),
      identificador: String(object.identificador).trim(),
      ip: String(object.ip ?? "").trim() || undefined,
      mac: String(object.mac ?? "").trim() || undefined,
      ubicacion: String(object.ubicacion ?? "").trim() || undefined,
      coordinates: parseCoordinates(object.coordinates),
      descripcion: String(object.descripcion ?? "").trim() || undefined,
      deviceBinding: parseDeviceBinding(object.deviceBinding),
      deviceBindingRequests: parseDeviceBindingRequests(
        object.deviceBindingRequests,
      ),
      deviceRuntimeSnapshot: parseDeviceRuntimeSnapshot(
        object.deviceRuntimeSnapshot,
      ),
      remoteSupport: parseRemoteSupport(object.remoteSupport),
      submodulos: parseSubmodulos(object.submodulos),
    });
  }
}

function parseDate(value: unknown): Date {
  const parsed =
    value instanceof Date
      ? value
      : typeof value === "number"
        ? new Date(value)
        : new Date(String(value ?? ""));

  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
}

function normalizeOptionalText(value: unknown): string | undefined {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

function parseDeviceBinding(value: unknown): ModuloDeviceBinding | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const source = value as Record<string, unknown>;
  const fingerprint = String(source.fingerprint ?? "").trim();
  if (!fingerprint) return null;

  return {
    fingerprint,
    cpuSerial: normalizeOptionalText(source.cpuSerial),
    machineId: normalizeOptionalText(source.machineId),
    primaryMac: normalizeOptionalText(source.primaryMac),
    boundAt: parseDate(source.boundAt),
    lastSeenAt: parseDate(source.lastSeenAt),
  };
}

function parseDeviceBindingRequests(value: unknown): ModuloDeviceBindingRequest[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item): ModuloDeviceBindingRequest | null => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;

      const source = item as Record<string, unknown>;
      const fingerprint = String(source.fingerprint ?? "").trim();
      const status = String(source.status ?? "").trim().toUpperCase();

      if (
        !fingerprint ||
        (status !== "PENDING" && status !== "APPROVED" && status !== "REJECTED")
      ) {
        return null;
      }

      return {
        fingerprint,
        cpuSerial: normalizeOptionalText(source.cpuSerial),
        machineId: normalizeOptionalText(source.machineId),
        primaryMac: normalizeOptionalText(source.primaryMac),
        ipAddress: normalizeOptionalText(source.ipAddress),
        locationLabel: normalizeOptionalText(source.locationLabel),
        status: status as ModuloDeviceBindingRequestStatus,
        requestedAt: parseDate(source.requestedAt),
        resolvedAt: source.resolvedAt ? parseDate(source.resolvedAt) : undefined,
        notes: normalizeOptionalText(source.notes),
      };
    })
    .filter((item): item is ModuloDeviceBindingRequest => item !== null);
}

function parseDeviceRuntimeSnapshot(
  value: unknown,
): ModuloDeviceRuntimeSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const source = value as Record<string, unknown>;

  return {
    fingerprint: normalizeOptionalText(source.fingerprint),
    socketId: normalizeOptionalText(source.socketId),
    ipAddress: normalizeOptionalText(source.ipAddress),
    locationLabel: normalizeOptionalText(source.locationLabel),
    connectionStatus: normalizeOptionalText(source.connectionStatus),
    heartbeatStatus: normalizeOptionalText(source.heartbeatStatus),
    isConnected: Boolean(source.isConnected),
    isAuthorized: Boolean(source.isAuthorized),
    connectedAt: source.connectedAt ? parseDate(source.connectedAt) : undefined,
    lastHeartbeatAt: source.lastHeartbeatAt
      ? parseDate(source.lastHeartbeatAt)
      : undefined,
    lastDisconnectAt: source.lastDisconnectAt
      ? parseDate(source.lastDisconnectAt)
      : undefined,
    message: normalizeOptionalText(source.message),
    sourceInstallationId: normalizeOptionalText(source.sourceInstallationId),
    syncedAt: source.syncedAt ? parseDate(source.syncedAt) : undefined,
  };
}

function parseRemoteSupport(value: unknown): ModuloRemoteSupport | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const source = value as Record<string, unknown>;
  const provider = String(source.provider ?? "MESHCENTRAL").trim().toUpperCase();
  if (provider !== "MESHCENTRAL") return null;

  return {
    provider,
    enabled: Boolean(source.enabled),
    deviceName: normalizeOptionalText(source.deviceName),
    deviceId: normalizeOptionalText(source.deviceId),
    groupId: normalizeOptionalText(source.groupId),
    baseUrl: normalizeOptionalText(source.baseUrl),
    supportUrl: normalizeOptionalText(source.supportUrl),
    desktopUrl: normalizeOptionalText(source.desktopUrl),
    terminalUrl: normalizeOptionalText(source.terminalUrl),
    linkedAt: source.linkedAt ? parseDate(source.linkedAt) : undefined,
    updatedAt: source.updatedAt ? parseDate(source.updatedAt) : undefined,
  };
}

function parseSubmodulos(value: unknown): ModuloSubmodulo[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => parseSubmodulo(item))
    .filter((item): item is ModuloSubmodulo => Boolean(item));
}

function parseSubmodulo(value: unknown): ModuloSubmodulo | null {
  if (!value || typeof value !== "object") return null;

  const source = value as Record<string, unknown>;
  const submoduloId = String(source.submoduloId ?? source.id ?? source._id ?? "").trim();
  const nombre = String(source.nombre ?? source.name ?? "").trim();
  const tipo = String(source.tipo ?? source.type ?? "OTHER").trim().toUpperCase();

  if (!submoduloId || !nombre) return null;

  return {
    submoduloId,
    nombre,
    tipo: MODULO_SUBMODULO_TIPOS.includes(tipo as ModuloSubmoduloTipo)
      ? (tipo as ModuloSubmoduloTipo)
      : "OTHER",
    identificador: String(source.identificador ?? "").trim() || undefined,
    ip: String(source.ip ?? "").trim() || undefined,
    mac: String(source.mac ?? "").trim() || undefined,
    ubicacion: String(source.ubicacion ?? "").trim() || undefined,
    coordinates: parseCoordinates(source.coordinates),
    descripcion: String(source.descripcion ?? "").trim() || undefined,
    estado: source.estado === undefined ? true : Boolean(source.estado),
  };
}

function parseCoordinates(value: unknown): [number, number] | undefined {
  if (!Array.isArray(value) || value.length !== 2) return undefined;
  const longitude = Number(value[0]);
  const latitude = Number(value[1]);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return undefined;
  return [longitude, latitude];
}
