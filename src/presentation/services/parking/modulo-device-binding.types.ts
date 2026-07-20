import {
  ModuloDeviceConnectionAuditStatus,
  ModuloDeviceRuntimeConnectionStatus,
  ModuloEntity,
} from "../../../domain/entities/parking/modulo.entity";

export interface DeviceRegistrationPayload {
  fingerprint: string;
  cpuSerial?: string;
  machineId?: string;
  primaryMac?: string;
  ipAddress?: string;
  locationLabel?: string;
  hasActiveConnection?: boolean;
  deviceSecret?: string;
}

export interface ResolveDeviceBindingRequestPayload {
  fingerprint?: string;
  notes?: string;
}

export interface DeviceConnectionAuditPayload {
  fingerprint?: string;
  cpuSerial?: string;
  machineId?: string;
  primaryMac?: string;
  ipAddress?: string;
  locationLabel?: string;
  socketId?: string;
  status: ModuloDeviceConnectionAuditStatus;
  reason?: string;
}

export interface DeviceRuntimePayload {
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

export interface ModuloFilters {
  proyecto?: string;
  tipo?: ModuloEntity["tipo"];
  estado?: boolean;
}
