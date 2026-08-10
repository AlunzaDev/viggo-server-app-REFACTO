import { createHash } from "node:crypto";
import { isValidObjectId } from "mongoose";

import { PermissionProfileModel } from "../../../data/mongo/models/auth/permission-profile.schema";
import { UsuarioModel } from "../../../data/mongo/models/auth/usuario.schema";
import { ModuloModel } from "../../../data/mongo/models/parking/modulo.schema";
import { ProyectoModel } from "../../../data/mongo/models/parking/proyecto.schema";
import { PensionPassModel } from "../../../data/mongo/models/pension/pension-pass.schema";
import { PensionModel } from "../../../data/mongo/models/pension/pension.schema";
import { ProjectHeartbeatSnapshotModel } from "../../../data/mongo/models/system/project-heartbeat-snapshot.schema";
import { LocalInstallationRequestModel } from "../../../data/mongo/models/system/local-installation-request.schema";
import { InboxEventModel } from "../../../data/mongo/models/sync/inbox-event.schema";

import {
  getInvalidUserModulesForApp,
  normalizeUserApps,
  normalizeUserModulesForApp,
  type UserAppAccess,
} from "../../../domain/constants";
import {
  SyncDatasource,
  type HeartbeatSnapshotPayload,
  type InboxEventPayload,
  type InstallationLinkRequestPayload,
} from "../../../domain/datasources/sync/sync.datasource";

const USER_SYNC_SELECT =
  "nombre apellido correo telefono coordinates password emailValidated rol parkings allowedApps appPermissions nacimiento img estado google";

const hashToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

const buildStableVersion = (payload: unknown): number => {
  const hash = createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex")
    .slice(0, 10);

  return parseInt(hash, 16);
};

const normalizeProfileId = (value: unknown): string => {
  if (typeof value !== "string") return "";
  return value.trim();
};

const getPermissionProfileIds = (users: unknown[]): string[] => {
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

const findActiveProfileForApp = async (
  permissionProfileId: string,
  app: UserAppAccess,
) => {
  if (!isValidObjectId(permissionProfileId)) {
    return null;
  }

  return PermissionProfileModel.findOne({
    _id: permissionProfileId,
    app,
    estado: true,
  }).lean();
};

const resolveAccessUserForApp = async (
  user: Record<string, unknown>,
  app: UserAppAccess,
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
            permissionProfileId: String(profile._id),
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

const toDateOrNull = (value: unknown): Date | null => {
  const parsed =
    value instanceof Date
      ? value
      : typeof value === "number"
        ? new Date(value)
        : new Date(String(value ?? ""));

  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizeOptionalText = (value: unknown): string =>
  String(value ?? "").trim();

const normalizeDeviceBinding = (value: unknown) => {
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

const normalizeDeviceBindingRequests = (value: unknown) => {
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

const normalizeDeviceConnectionAudit = (value: unknown) => {
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

const applyDeviceRuntimeSnapshotToModules = async (
  payload: HeartbeatSnapshotPayload,
  receivedAt: number,
) => {
  const modules = Array.isArray(payload.modules) ? payload.modules : [];

  await Promise.all(
    modules.map(async (item) => {
      const source = item as Record<string, unknown>;
      const moduleId = normalizeOptionalText(source.id);
      if (!moduleId || !isValidObjectId(moduleId)) return;

      const lastHeartbeatAt = toDateOrNull(source.lastHeartbeatAt);
      const lastDisconnectAt = toDateOrNull(source.lastDisconnectAt);
      const connectedAt = toDateOrNull(source.connectedAt);
      const heartbeatStatus = normalizeOptionalText(source.heartbeatStatus);
      const connectionStatus = normalizeOptionalText(
        source.connectionStatus,
      ).toUpperCase();
      const runtimeFingerprint =
        normalizeOptionalText(
          (source.deviceBinding as Record<string, unknown> | undefined)
            ?.fingerprint,
        ) || normalizeOptionalText(source.fingerprint);

      await ModuloModel.updateOne(
        {
          _id: moduleId,
          proyecto: payload.proyectoId,
        },
        {
          $set: {
            deviceBinding: normalizeDeviceBinding(source.deviceBinding),
            deviceBindingRequests: normalizeDeviceBindingRequests(
              source.deviceBindingRequests,
            ),
            deviceConnectionAudit: normalizeDeviceConnectionAudit(
              source.deviceConnectionAudit,
            ),
            deviceRuntimeSnapshot: {
              fingerprint: runtimeFingerprint,
              socketId: normalizeOptionalText(source.socketId),
              ipAddress: normalizeOptionalText(source.ipAddress),
              locationLabel: normalizeOptionalText(source.locationLabel),
              connectionStatus: [
                "CONNECTED",
                "DISCONNECTED",
                "PENDING",
                "REJECTED",
                "MISMATCH",
              ].includes(connectionStatus)
                ? connectionStatus
                : "PENDING",
              heartbeatStatus: ["online", "offline", "pending"].includes(
                heartbeatStatus,
              )
                ? heartbeatStatus
                : "pending",
              isConnected: Boolean(source.isConnected),
              isAuthorized: Boolean(source.isAuthorized),
              connectedAt: connectedAt ?? undefined,
              lastHeartbeatAt: lastHeartbeatAt ?? undefined,
              lastDisconnectAt: lastDisconnectAt ?? undefined,
              message: normalizeOptionalText(source.message),
              sourceInstallationId: payload.installationId,
              syncedAt: new Date(receivedAt),
            },
          },
        },
      );
    }),
  );
};

export class SyncMongoDatasource implements SyncDatasource {
  async getConfiguration(proyectoId: string) {
    const proyecto = await ProyectoModel.findById(proyectoId).lean();

    if (!proyecto) return null;

    const [modulos, pensiones] = await Promise.all([
      ModuloModel.find({
        proyecto: proyectoId,
      })
        .select(
          [
            "nombre",
            "proyecto",
            "tipo",
            "estado",
            "identificador",
            "ip",
            "mac",
            "ubicacion",
            "coordinates",
            "descripcion",
            "remoteSupport.provider",
            "remoteSupport.enabled",
            "remoteSupport.deviceName",
            "remoteSupport.deviceId",
            "remoteSupport.groupId",
            "remoteSupport.baseUrl",
            "remoteSupport.supportUrl",
            "remoteSupport.desktopUrl",
            "remoteSupport.terminalUrl",
            "remoteSupport.linkedAt",
            "remoteSupport.updatedAt",
            "submodulos.submoduloId",
            "submodulos.nombre",
            "submodulos.tipo",
            "submodulos.identificador",
            "submodulos.ip",
            "submodulos.mac",
            "submodulos.ubicacion",
            "submodulos.coordinates",
            "submodulos.descripcion",
            "submodulos.estado",
          ].join(" "),
        )
        .lean(),
      PensionModel.find({
        proyecto: proyectoId,
      }).lean(),
    ]);

    const pensionIds = pensiones.map((item) => String(item._id));

    const pensionPasses = await PensionPassModel.find({
      pension: {
        $in: pensionIds,
      },
    })
      .select(
        "usuario name pension idPass vigent created from to estado antiPassback",
      )
      .lean();

    const snapshot = {
      proyecto,
      modulos,
      pensiones,
      pensionPasses,
    };

    return {
      version: buildStableVersion(snapshot),
      ...snapshot,
    };
  }

  getProjectsCatalog() {
    return ProyectoModel.find({
      estado: true,
    })
      .select(
        "nombre ciudad direccion identificador codigoProyecto serverIp serverMac localApiBaseUrl img descripcion estado coordinates",
      )
      .sort({
        nombre: 1,
      })
      .lean();
  }

  async getAccessSnapshot(proyectoId: string) {
    const proyecto = await ProyectoModel.findById(proyectoId).lean();

    if (!proyecto) return null;

    const users = await UsuarioModel.find({
      $or: [
        {
          parkings: proyectoId,
        },
        {
          rol: "SUPER_ROLE",
        },
      ],
    })
      .select(USER_SYNC_SELECT)
      .lean();

    const profileIds = getPermissionProfileIds(users);

    const permissionProfiles =
      profileIds.length > 0
        ? await PermissionProfileModel.find({
            _id: {
              $in: profileIds,
            },
          })
            .sort({
              app: 1,
              nombre: 1,
            })
            .lean()
        : [];

    const snapshot = {
      proyectoId,
      users,
      permissionProfiles,
    };

    return {
      version: buildStableVersion(snapshot),
      ...snapshot,
    };
  }

  async getAccessUserByCorreo(correo: string, app: UserAppAccess) {
    const user = await UsuarioModel.findOne({
      correo,
    })
      .select(USER_SYNC_SELECT)
      .lean();

    if (!user) return null;

    return resolveAccessUserForApp(
      user as unknown as Record<string, unknown>,
      app,
    );
  }

  async getAccessUserByTelefono(telefono: string, app: UserAppAccess) {
    const user = await UsuarioModel.findOne({
      telefono,
    })
      .select(USER_SYNC_SELECT)
      .lean();

    if (!user) return null;

    return resolveAccessUserForApp(
      user as unknown as Record<string, unknown>,
      app,
    );
  }

  async requestInstallationLink(payload: InstallationLinkRequestPayload) {
    const proyecto = await ProyectoModel.findById(payload.proyectoId).lean();

    if (!proyecto) {
      return {
        status: "missing-project" as const,
      };
    }

    const expectedTokenHash = String(
      proyecto.installationLinkTokenHash ?? "",
    ).trim();

    if (!expectedTokenHash) {
      return {
        status: "missing-token" as const,
      };
    }

    if (hashToken(payload.installationLinkToken) !== expectedTokenHash) {
      return {
        status: "invalid-token" as const,
      };
    }

    const existing = await LocalInstallationRequestModel.findOne({
      installationId: payload.installationId,
    }).lean();

    if (
      existing?.status === "approved" &&
      existing.proyectoId !== payload.proyectoId
    ) {
      return {
        status: "already-approved-other-project" as const,
        request: existing,
      };
    }

    const now = Date.now();

    const request = await LocalInstallationRequestModel.findOneAndUpdate(
      {
        installationId: payload.installationId,
      },
      {
        installationId: payload.installationId,
        proyectoId: payload.proyectoId,
        proyectoNombre: String(proyecto.nombre ?? ""),
        proyectoIdentificador: String(proyecto.identificador ?? ""),
        localApiBaseUrl: payload.localApiBaseUrl,
        serverIp: payload.serverIp,
        serverMac: payload.serverMac,
        browserCoordinates: payload.browserCoordinates,
        browserLocationAccuracy: payload.browserLocationAccuracy,
        browserLocationCapturedAt: payload.browserLocationCapturedAt,
        status: existing?.status === "approved" ? "approved" : "pending",
        requestedByUserId: payload.requestedByUserId,
        requestedByUserName: payload.requestedByUserName,
        requestedAt:
          existing?.status === "pending" ? existing.requestedAt : now,
        reviewedByUserId:
          existing?.status === "approved" ? existing.reviewedByUserId : "",
        reviewedByUserName:
          existing?.status === "approved" ? existing.reviewedByUserName : "",
        reviewedAt:
          existing?.status === "approved" ? existing.reviewedAt : undefined,
        reviewNote: existing?.status === "approved" ? existing.reviewNote : "",
        updatedAt: now,
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      },
    ).lean();

    return {
      status: "ok" as const,
      request,
    };
  }

  async getInstallationRequestStatus(installationId: string) {
    const requestDocument = await LocalInstallationRequestModel.findOne({
      installationId,
    });

    const request = requestDocument?.toObject();

    const proyecto =
      request?.status === "approved"
        ? await ProyectoModel.findById(request.proyectoId).lean()
        : null;

    return {
      request,
      proyecto,
      oneTimeSyncToken: null,
    };
  }

  async receiveHeartbeatSnapshot(payload: HeartbeatSnapshotPayload) {
    const proyecto = await ProyectoModel.findById(payload.proyectoId).lean();

    if (!proyecto) {
      return {
        accepted: false,
        proyectoId: payload.proyectoId,
        reason: "PROJECT_NOT_FOUND",
      };
    }

    const receivedAt = Date.now();

    await ProjectHeartbeatSnapshotModel.findOneAndUpdate(
      {
        proyectoId: payload.proyectoId,
      },
      {
        proyectoId: payload.proyectoId,
        installationId: payload.installationId,
        source: payload.source,
        generatedAt: payload.generatedAt,
        receivedAt,
        summary: payload.summary,
        modules: payload.modules,
        metadata: {
          ...(payload.metadata ?? {}),
          proyectoNombre: String(proyecto.nombre ?? ""),
          proyectoIdentificador: String(proyecto.identificador ?? ""),
        },
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      },
    );

    await applyDeviceRuntimeSnapshotToModules(payload, receivedAt);

    return {
      accepted: true,
      proyectoId: payload.proyectoId,
      receivedAt,
    };
  }

  async receiveEvent(payload: InboxEventPayload) {
    const existing = await InboxEventModel.findOne({
      eventId: payload.eventId,
    }).lean();

    if (existing) {
      return {
        accepted: true,
        duplicate: true,
        eventId: payload.eventId,
      };
    }

    await InboxEventModel.create(payload);

    return {
      accepted: true,
      duplicate: false,
      eventId: payload.eventId,
    };
  }
}
