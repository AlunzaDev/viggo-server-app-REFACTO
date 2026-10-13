// Database-independent helpers shared by the Mongo and Postgres sync datasources.
import { createHash } from "node:crypto";
import {
  getInvalidUserModulesForApp,
  normalizeUserApps,
  normalizeUserModulesForApp,
  type UserAppAccess,
} from "../../../domain/constants";
import { parseRemoteSupportProvider } from "../../../domain/entities/parking/remote-support.entity";

/** Active permission profile with the given id for the app, or null. */
export type ActiveProfileLookup = (
  permissionProfileId: string,
  app: UserAppAccess,
) => Promise<{ id?: unknown; _id?: unknown; modules: unknown; [key: string]: unknown } | null>;

export const hashToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

export const buildStableVersion = (payload: unknown): number => {
  const hash = createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex")
    .slice(0, 10);

  return parseInt(hash, 16);
};

export const normalizeProfileId = (value: unknown): string => {
  if (typeof value !== "string") return "";
  return value.trim();
};

export const getPermissionProfileIds = (users: unknown[]): string[] => {
  const profileIds = new Set<string>();

  for (const item of users) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      continue;
    }

    const user = item as Record<string, unknown>;
    if (!Array.isArray(user.appPermissions)) {
      continue;
    }

    for (const itemPermission of user.appPermissions) {
      if (
        typeof itemPermission !== "object" ||
        itemPermission === null ||
        Array.isArray(itemPermission)
      ) {
        continue;
      }

      const permission = itemPermission as Record<string, unknown>;

      const profileId = normalizeProfileId(permission.permissionProfileId);

      if (profileId) {
        profileIds.add(profileId);
      }
    }
  }

  return Array.from(profileIds);
};

export const resolveAccessUserForApp = async (
  user: Record<string, unknown>,
  app: UserAppAccess,
  findActiveProfileForApp: ActiveProfileLookup,
) => {
  const allowedApps = normalizeUserApps(user.allowedApps);

  if (!allowedApps.includes(app)) {
    return null;
  }

  const rawAppPermissions = Array.isArray(user.appPermissions)
    ? user.appPermissions
    : [];

  const assignment = rawAppPermissions.find((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      return false;
    }

    const permission = item as Record<string, unknown>;

    return (
      permission.app === app &&
      normalizeProfileId(permission.permissionProfileId).length > 0
    );
  }) as Record<string, unknown> | undefined;

  if (assignment) {
    const assignedProfileId = normalizeProfileId(
      assignment.permissionProfileId,
    );

    const profile = await findActiveProfileForApp(assignedProfileId, app);

    if (!profile) {
      return null;
    }

    if (getInvalidUserModulesForApp(profile.modules, app).length > 0) {
      return null;
    }

    return {
      user: {
        ...user,
        allowedApps,
        appPermissions: [
          {
            app,
            permissionProfileId: String(profile.id ?? profile._id),
          },
        ],
      },
      permissionProfile: {
        ...profile,
        modules: normalizeUserModulesForApp(profile.modules, app),
      },
    };
  }

  return app === "OPERATIVE_MOBILE"
    ? {
        user: {
          ...user,
          allowedApps,
          appPermissions: [],
        },
        permissionProfile: null,
      }
    : null;
};

export const toDateOrNull = (value: unknown): Date | null => {
  const parsed =
    value instanceof Date
      ? value
      : typeof value === "number"
        ? new Date(value)
        : new Date(String(value ?? ""));

  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const normalizeOptionalText = (value: unknown): string =>
  String(value ?? "").trim();

export const normalizeDeviceBinding = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const source = value as Record<string, unknown>;
  const fingerprint = normalizeOptionalText(source.fingerprint);
  const boundAt = toDateOrNull(source.boundAt);
  const lastSeenAt = toDateOrNull(source.lastSeenAt);

  if (!fingerprint || !boundAt || !lastSeenAt) return null;

  return {
    fingerprint,
    cpuSerial: normalizeOptionalText(source.cpuSerial),
    machineId: normalizeOptionalText(source.machineId),
    primaryMac: normalizeOptionalText(source.primaryMac),
    boundAt,
    lastSeenAt,
  };
};

export const normalizeDeviceBindingRequests = (value: unknown) => {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;

      const source = item as Record<string, unknown>;
      const fingerprint = normalizeOptionalText(source.fingerprint);
      const status = normalizeOptionalText(source.status).toUpperCase();
      const requestedAt = toDateOrNull(source.requestedAt);

      if (
        !fingerprint ||
        !requestedAt ||
        !["PENDING", "APPROVED", "REJECTED"].includes(status)
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
        status,
        requestedAt,
        resolvedAt: toDateOrNull(source.resolvedAt) ?? undefined,
        notes: normalizeOptionalText(source.notes),
      };
    })
    .filter(Boolean);
};

export const normalizeDeviceConnectionAudit = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const source = value as Record<string, unknown>;
  const status = normalizeOptionalText(source.status).toUpperCase();
  const attemptedAt = toDateOrNull(source.attemptedAt);

  if (!attemptedAt || !["APPROVED", "PENDING", "REJECTED"].includes(status)) {
    return null;
  }

  return {
    fingerprint: normalizeOptionalText(source.fingerprint),
    cpuSerial: normalizeOptionalText(source.cpuSerial),
    machineId: normalizeOptionalText(source.machineId),
    primaryMac: normalizeOptionalText(source.primaryMac),
    ipAddress: normalizeOptionalText(source.ipAddress),
    locationLabel: normalizeOptionalText(source.locationLabel),
    socketId: normalizeOptionalText(source.socketId),
    status,
    reason: normalizeOptionalText(source.reason),
    attemptedAt,
  };
};

export const normalizeRemoteSupport = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const source = value as Record<string, unknown>;
  const provider = parseRemoteSupportProvider(source.provider);
  if (!provider) return null;

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
    linkedAt: toDateOrNull(source.linkedAt) ?? undefined,
    updatedAt: toDateOrNull(source.updatedAt) ?? new Date(),
  };
};

/** Device runtime fields of one module as reported in an OPERATIVO heartbeat. */
export const toDeviceRuntimeSnapshot = (
  source: Record<string, unknown>,
  installationId: string,
  receivedAt: number,
) => {
  const connectionStatus = normalizeOptionalText(source.connectionStatus).toUpperCase();
  const heartbeatStatus = normalizeOptionalText(source.heartbeatStatus);
  return {
    fingerprint:
      normalizeOptionalText((source.deviceBinding as Record<string, unknown> | undefined)?.fingerprint) ||
      normalizeOptionalText(source.fingerprint),
    socketId: normalizeOptionalText(source.socketId),
    ipAddress: normalizeOptionalText(source.ipAddress),
    locationLabel: normalizeOptionalText(source.locationLabel),
    connectionStatus: (["CONNECTED", "DISCONNECTED", "PENDING", "REJECTED", "MISMATCH"].includes(connectionStatus)
      ? connectionStatus
      : "PENDING") as "CONNECTED" | "DISCONNECTED" | "PENDING" | "REJECTED" | "MISMATCH",
    heartbeatStatus: (["online", "offline", "pending"].includes(heartbeatStatus) ? heartbeatStatus : "pending") as
      | "online"
      | "offline"
      | "pending",
    isConnected: Boolean(source.isConnected),
    isAuthorized: Boolean(source.isAuthorized),
    connectedAt: toDateOrNull(source.connectedAt) ?? undefined,
    lastHeartbeatAt: toDateOrNull(source.lastHeartbeatAt) ?? undefined,
    lastDisconnectAt: toDateOrNull(source.lastDisconnectAt) ?? undefined,
    message: normalizeOptionalText(source.message),
    sourceInstallationId: installationId,
    syncedAt: new Date(receivedAt),
  };
};
