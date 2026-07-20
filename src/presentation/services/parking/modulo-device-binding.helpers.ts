import { randomBytes } from "crypto";
import {
  ModuloDeviceBinding,
  ModuloDeviceBindingRequest,
} from "../../../domain/entities/parking/modulo.entity";
import {
  DeviceRegistrationPayload,
  DeviceRuntimePayload,
} from "./modulo-device-binding.types";

export function normalizeDeviceRegistration(
  device: DeviceRegistrationPayload,
): DeviceRegistrationPayload {
  return {
    fingerprint: String(device.fingerprint ?? "").trim().toLowerCase(),
    cpuSerial: String(device.cpuSerial ?? "").trim().toLowerCase() || undefined,
    machineId: String(device.machineId ?? "").trim().toLowerCase() || undefined,
    primaryMac: String(device.primaryMac ?? "").trim().toLowerCase() || undefined,
    ipAddress: String(device.ipAddress ?? "").trim() || undefined,
    locationLabel: String(device.locationLabel ?? "").trim() || undefined,
    hasActiveConnection: Boolean(device.hasActiveConnection),
    deviceSecret: String(device.deviceSecret ?? "").trim() || undefined,
  };
}

export function buildDeviceRuntimePayload(payload: DeviceRuntimePayload) {
  return {
    fingerprint: String(payload.fingerprint ?? "").trim() || undefined,
    socketId: String(payload.socketId ?? "").trim() || undefined,
    ipAddress: String(payload.ipAddress ?? "").trim() || undefined,
    locationLabel: String(payload.locationLabel ?? "").trim() || undefined,
    connectionStatus: payload.connectionStatus,
    isConnected: Boolean(payload.isConnected),
    isAuthorized: Boolean(payload.isAuthorized),
    connectedAt: payload.connectedAt,
    lastHeartbeatAt: payload.lastHeartbeatAt,
    lastDisconnectAt: payload.lastDisconnectAt,
    message: String(payload.message ?? "").trim() || undefined,
  };
}

export function buildNextDeviceBinding(
  currentBinding: ModuloDeviceBinding | null | undefined,
  device: DeviceRegistrationPayload,
  overrides?: {
    deviceSecretHash?: string | null;
    deviceSecretIssuedAt?: Date | null;
  },
): ModuloDeviceBinding {
  const now = new Date();

  return {
    fingerprint: device.fingerprint,
    cpuSerial: device.cpuSerial,
    machineId: device.machineId,
    primaryMac: device.primaryMac,
    deviceSecretHash: resolveOptionalString(
      overrides,
      overrides?.deviceSecretHash,
      currentBinding?.deviceSecretHash,
    ),
    deviceSecretIssuedAt: resolveOptionalDate(
      overrides,
      overrides?.deviceSecretIssuedAt,
      currentBinding?.deviceSecretIssuedAt,
    ),
    boundAt: currentBinding?.boundAt ?? now,
    lastSeenAt: now,
  };
}

export function generateDeviceSecret(): string {
  return randomBytes(32).toString("hex");
}

export function upsertDeviceBindingRequest(
  requests: ModuloDeviceBindingRequest[],
  device: DeviceRegistrationPayload,
  status: "PENDING",
  notes?: string,
): ModuloDeviceBindingRequest[] {
  const now = new Date();
  const nextRequest: ModuloDeviceBindingRequest = {
    fingerprint: device.fingerprint,
    cpuSerial: device.cpuSerial,
    machineId: device.machineId,
    primaryMac: device.primaryMac,
    ipAddress: device.ipAddress,
    locationLabel: device.locationLabel,
    status,
    requestedAt: now,
    notes: String(notes ?? "").trim() || undefined,
  };

  const remainingRequests = requests.filter(
    (request) => request.fingerprint !== device.fingerprint,
  );

  return [...remainingRequests, nextRequest];
}

export function findPendingRequest(
  requests: ModuloDeviceBindingRequest[],
  fingerprint?: string,
): ModuloDeviceBindingRequest | null {
  const pendingRequests = requests.filter((request) => request.status === "PENDING");

  if (!pendingRequests.length) {
    return null;
  }

  if (fingerprint) {
    return (
      pendingRequests.find((request) => request.fingerprint === fingerprint) ?? null
    );
  }

  return pendingRequests.sort(
    (left, right) => right.requestedAt.getTime() - left.requestedAt.getTime(),
  )[0];
}

export function findRejectedRequest(
  requests: ModuloDeviceBindingRequest[],
  fingerprint?: string,
): ModuloDeviceBindingRequest | null {
  if (!fingerprint) {
    return null;
  }

  return (
    requests.find(
      (request) =>
        request.fingerprint === fingerprint && request.status === "REJECTED",
    ) ?? null
  );
}

export function findRequest(
  requests: ModuloDeviceBindingRequest[],
  fingerprint?: string,
): ModuloDeviceBindingRequest | null {
  if (!fingerprint) {
    return null;
  }

  return requests.find((request) => request.fingerprint === fingerprint) ?? null;
}

export function resolveRequest(
  request: ModuloDeviceBindingRequest,
  status: "APPROVED" | "REJECTED",
  notes?: string,
): ModuloDeviceBindingRequest {
  return {
    ...request,
    status,
    resolvedAt: new Date(),
    notes: String(notes ?? "").trim() || request.notes,
  };
}

export function reopenRequest(
  request: ModuloDeviceBindingRequest,
  notes?: string,
): ModuloDeviceBindingRequest {
  return {
    ...request,
    status: "PENDING",
    resolvedAt: undefined,
    notes: String(notes ?? "").trim() || request.notes,
  };
}

export function replaceRequest(
  requests: ModuloDeviceBindingRequest[],
  nextRequest: ModuloDeviceBindingRequest,
): ModuloDeviceBindingRequest[] {
  return requests.map((request) =>
    request.fingerprint === nextRequest.fingerprint ? nextRequest : request,
  );
}

function resolveOptionalString(
  overrides:
    | {
        deviceSecretHash?: string | null;
        deviceSecretIssuedAt?: Date | null;
      }
    | undefined,
  nextValue: string | null | undefined,
  fallbackValue: string | undefined,
): string | undefined {
  if (!overrides || !Object.prototype.hasOwnProperty.call(overrides, "deviceSecretHash")) {
    return fallbackValue;
  }

  if (nextValue === null) {
    return undefined;
  }

  return nextValue || fallbackValue;
}

function resolveOptionalDate(
  overrides:
    | {
        deviceSecretHash?: string | null;
        deviceSecretIssuedAt?: Date | null;
      }
    | undefined,
  nextValue: Date | null | undefined,
  fallbackValue: Date | undefined,
): Date | undefined {
  if (!overrides || !Object.prototype.hasOwnProperty.call(overrides, "deviceSecretIssuedAt")) {
    return fallbackValue;
  }

  if (nextValue === null) {
    return undefined;
  }

  return nextValue ?? fallbackValue;
}
