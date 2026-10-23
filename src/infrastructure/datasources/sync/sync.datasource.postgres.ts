import { OperationalInboxProcessor } from "./operational-inbox.processor";
import { issueSyncToken } from "../../../config/plugins/installation-sync-token.plugin";
import { randomBytes } from "node:crypto";
import { PostgresDatabase } from "../../../data/postgres";
import { Prisma } from "../../../generated/prisma/client";
import { AUTH_ROLES, type UserAppAccess } from "../../../domain/constants";
import {
  SyncDatasource,
  type HeartbeatSnapshotPayload,
  type InboxEventPayload,
  type InstallationLinkRequestPayload,
} from "../../../domain/datasources/sync/sync.datasource";
import { CustomError } from "../../../domain/errors/custom.error";
import { toInstallationRecord } from "../installations/installations.datasource.postgres";
import { isUuid, withPrismaErrors } from "../postgres/prisma-errors";
import {
  byText,
  moduloDocumentInclude,
  pensionDocumentInclude,
  proyectoDocumentInclude,
  toModuloDocument,
  toPensionDocument,
  toPensionPassDocument,
  toPermissionProfileDocument,
  toProyectoDocument,
  toUsuarioDocument,
  usuarioDocumentInclude,
} from "./sync.documents.postgres";
import {
  buildStableVersion,
  getPermissionProfileIds,
  hashToken,
  normalizeDeviceBinding,
  normalizeDeviceBindingRequests,
  normalizeDeviceConnectionAudit,
  normalizeOptionalText,
  normalizeRemoteSupport,
  resolveAccessUserForApp,
  toDeviceRuntimeSnapshot,
  type ActiveProfileLookup,
} from "./sync.normalizers";

const installationInclude = {
  proyecto: { select: { nombre: true, identificador: true } },
} satisfies Prisma.LocalInstallationInclude;

const findActiveProfileForApp: ActiveProfileLookup = async (permissionProfileId, app) => {
  if (!isUuid(permissionProfileId)) return null;
  const profile = await PostgresDatabase.client.permissionProfile.findFirst({
    where: { id: permissionProfileId, app, estado: true },
  });
  return profile ? toPermissionProfileDocument(profile) : null;
};

const asJson = (value: unknown) => value as Prisma.InputJsonValue;

export class SyncPostgresDatasource implements SyncDatasource {
  private get db() {
    return PostgresDatabase.client;
  }

  async getConfiguration(proyectoId: string) {
    if (!isUuid(proyectoId)) return null;
    const proyecto = await this.db.proyecto.findUnique({ where: { id: proyectoId }, include: proyectoDocumentInclude });
    if (!proyecto) return null;

    const [modulos, pensiones, pensionPasses] = await Promise.all([
      this.db.modulo.findMany({ where: { proyectoId }, include: moduloDocumentInclude, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
      this.db.pension.findMany({ where: { proyectoId }, include: pensionDocumentInclude, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
      this.db.pensionPass.findMany({ where: { pension: { proyectoId } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    ]);

    const snapshot = {
      proyecto: toProyectoDocument(proyecto),
      modulos: modulos.map(toModuloDocument),
      pensiones: pensiones.map(toPensionDocument),
      pensionPasses: pensionPasses.map(toPensionPassDocument),
    };
    return { version: buildStableVersion(snapshot), ...snapshot };
  }

  async findProjectByLinkToken(token: string) {
    if (!token) return null;
    return this.db.proyecto.findFirst({
      where: { installationLinkTokenHash: hashToken(token), estado: true },
      select: { id: true, nombre: true, identificador: true, codigoProyecto: true, ciudad: true },
    });
  }

  async getAccessSnapshot(proyectoId: string) {
    if (!isUuid(proyectoId)) return null;
    const exists = await this.db.proyecto.count({ where: { id: proyectoId } });
    if (!exists) return null;

    const rows = await this.db.usuario.findMany({
      where: { OR: [{ parkings: { some: { proyectoId } } }, { rol: "SUPER_ROLE" }] },
      include: usuarioDocumentInclude,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    const users = rows.map(toUsuarioDocument);
    const profileIds = getPermissionProfileIds(users).filter(isUuid);
    const profiles = profileIds.length
      ? await this.db.permissionProfile.findMany({ where: { id: { in: profileIds } } })
      : [];
    const permissionProfiles = profiles
      .map(toPermissionProfileDocument)
      .sort(byText((profile) => profile.app, (profile) => profile.nombre));

    const snapshot = { proyectoId, users, permissionProfiles };
    return { version: buildStableVersion(snapshot), ...snapshot };
  }

  async getAccessUserByCorreo(correo: string, app: UserAppAccess, proyectoId: string) {
    const row = await this.db.usuario.findUnique({ where: { correo }, include: usuarioDocumentInclude });
    return this.accessForProject(row, app, proyectoId);
  }

  async getAccessUserByTelefono(telefono: string, app: UserAppAccess, proyectoId: string) {
    const row = await this.db.usuario.findUnique({ where: { telefono }, include: usuarioDocumentInclude });
    return this.accessForProject(row, app, proyectoId);
  }

  /** Same rule as the access snapshot: users of the project, plus super admins. */
  private accessForProject(
    row: Prisma.UsuarioGetPayload<{ include: typeof usuarioDocumentInclude }> | null,
    app: UserAppAccess,
    proyectoId: string,
  ) {
    if (!row) return null;
    const allowed = row.rol === AUTH_ROLES.SUPER || row.parkings.some((parking) => parking.proyectoId === proyectoId);
    return allowed ? resolveAccessUserForApp(toUsuarioDocument(row), app, findActiveProfileForApp) : null;
  }

  async requestInstallationLink(payload: InstallationLinkRequestPayload) {
    // The project was resolved from the link token by the sync auth middleware.
    const proyecto = isUuid(payload.proyectoId)
      ? await this.db.proyecto.findUnique({ where: { id: payload.proyectoId } })
      : null;
    if (!proyecto) return { status: "missing-project" as const };

    const existing = await this.db.localInstallation.findUnique({
      where: { installationId: payload.installationId },
      include: installationInclude,
    });
    if (existing?.status === "approved" && existing.proyectoId !== payload.proyectoId) {
      return { status: "already-approved-other-project" as const, request: toInstallationRecord(existing) };
    }

    const approved = existing?.status === "approved";
    const [longitude, latitude] = payload.browserCoordinates ?? [];
    const fields = {
      proyectoId: payload.proyectoId,
      localApiBaseUrl: payload.localApiBaseUrl,
      serverIp: payload.serverIp,
      serverMac: payload.serverMac,
      browserLongitude: longitude ?? null,
      browserLatitude: latitude ?? null,
      browserLocationAccuracy: payload.browserLocationAccuracy ?? null,
      browserLocationCapturedAt:
        payload.browserLocationCapturedAt !== undefined ? new Date(payload.browserLocationCapturedAt) : null,
      status: approved ? ("approved" as const) : ("pending" as const),
      requestedByUserId: payload.requestedByUserId,
      requestedByUserName: payload.requestedByUserName,
      // A pending request keeps its original date; a new or re-sent one starts now.
      requestedAt: existing?.status === "pending" ? existing.requestedAt : new Date(),
      reviewedById: approved ? existing.reviewedById : null,
      reviewedByUserName: approved ? existing.reviewedByUserName : "",
      reviewedAt: approved ? existing.reviewedAt : null,
      reviewNote: approved ? existing.reviewNote : "",
    };

    const request = await this.db.localInstallation.upsert({
      where: { installationId: payload.installationId },
      create: { installationId: payload.installationId, ...fields },
      update: fields,
      include: installationInclude,
    });
    return { status: "ok" as const, request: toInstallationRecord(request) };
  }

  async getInstallationRequestStatus(installationId: string, proyectoId: string) {
    const found = await this.db.localInstallation.findUnique({ where: { installationId }, include: installationInclude });
    // A request for another project is not visible with this project's link token.
    const row = found?.proyectoId === proyectoId ? found : null;
    if (row?.status !== "approved") {
      return { request: row ? toInstallationRecord(row) : undefined, proyecto: null, oneTimeSyncToken: null };
    }

    // The installation proved it holds the project's link token: issue it a fresh sync token.
    // Only the hash is kept; asking again (e.g. the first answer was lost) replaces it.
    const issued = issueSyncToken();
    const oneTimeSyncToken = issued.syncToken;
    const now = new Date();
    const updated = await this.db.localInstallation.update({
      where: { installationId },
      data: {
        syncTokenHash: issued.syncTokenHash,
        adminCallTokenEncrypted: issued.adminCallTokenEncrypted,
        previousSyncTokenHash: "",
        syncTokenRotationRequestedAt: null,
        syncTokenIssuedAt: now,
        syncTokenDeliveredAt: now,
      },
      include: installationInclude,
    });
    const proyecto = await this.db.proyecto.findUnique({ where: { id: row.proyectoId }, include: proyectoDocumentInclude });
    return {
      request: toInstallationRecord(updated),
      proyecto: proyecto ? toProyectoDocument(proyecto) : null,
      oneTimeSyncToken,
    };
  }

  async receiveHeartbeatSnapshot(payload: HeartbeatSnapshotPayload) {
    const proyecto = isUuid(payload.proyectoId)
      ? await this.db.proyecto.findUnique({ where: { id: payload.proyectoId } })
      : null;
    if (!proyecto) {
      return { accepted: false, proyectoId: payload.proyectoId, reason: "PROJECT_NOT_FOUND" };
    }

    const receivedAt = Date.now();
    const snapshot = {
      installationId: payload.installationId,
      source: payload.source,
      generatedAt: new Date(payload.generatedAt),
      receivedAt: new Date(receivedAt),
      summary: asJson(payload.summary),
      modules: asJson(payload.modules),
      metadata: asJson({
        ...(payload.metadata ?? {}),
        proyectoNombre: proyecto.nombre,
        proyectoIdentificador: proyecto.identificador,
      }),
    };
    await this.db.projectHeartbeatSnapshot.upsert({
      where: { proyectoId: proyecto.id },
      create: { proyectoId: proyecto.id, ...snapshot },
      update: snapshot,
    });
    await this.applyDeviceStates(payload, receivedAt);

    return { accepted: true, proyectoId: payload.proyectoId, receivedAt };
  }

  async receiveEvent(payload: InboxEventPayload) {
    if (!isUuid(payload.proyectoId)) throw CustomError.badRequest("El proyecto del evento no existe");
    if (!Number.isFinite(new Date(payload.occurredAt).getTime())) throw CustomError.badRequest("occurredAt invalido");
    if (payload.sourcePosition !== undefined && (!/^[1-9][0-9]*$/.test(payload.sourcePosition) || BigInt(payload.sourcePosition) > 9223372036854775807n)) {
      throw CustomError.badRequest("sourcePosition debe ser un entero positivo de 64 bits");
    }
    const inserted = await withPrismaErrors(() => this.db.inboxEvent.createMany({
      skipDuplicates: true,
      data: { ...payload, occurredAt: new Date(payload.occurredAt), payload: asJson(payload.payload),
        sourcePosition: payload.sourcePosition ? BigInt(payload.sourcePosition) : null },
    }), { foreignKey: CustomError.badRequest("El proyecto del evento no existe") });
    await new OperationalInboxProcessor().processEvent(payload.eventId);
    return { accepted: true, duplicate: inserted.count === 0, eventId: payload.eventId };
  }

  /** Mirrors each reported module's binding and runtime state (modules of other projects are ignored). */
  private async applyDeviceStates(payload: HeartbeatSnapshotPayload, receivedAt: number) {
    const reported = (Array.isArray(payload.modules) ? payload.modules : [])
      .map((item) => item as Record<string, unknown>)
      .filter((item) => isUuid(normalizeOptionalText(item.id)));
    if (!reported.length) return;
    // A module's change of state is dated when OPERATIVO saw it (REFACTO#63).
    const generatedAt = new Date(payload.generatedAt);
    const changedAt = Number.isFinite(generatedAt.getTime()) ? generatedAt : new Date(receivedAt);

    const owned = new Set(
      (
        await this.db.modulo.findMany({
          where: { proyectoId: payload.proyectoId, id: { in: reported.map((item) => normalizeOptionalText(item.id)) } },
          select: { id: true },
        })
      ).map((modulo) => modulo.id),
    );

    for (const source of reported) {
      const moduloId = normalizeOptionalText(source.id);
      if (!owned.has(moduloId)) continue;

      const binding = normalizeDeviceBinding(source.deviceBinding);
      const audit = normalizeDeviceConnectionAudit(source.deviceConnectionAudit);
      const runtime = toDeviceRuntimeSnapshot(source, payload.installationId, receivedAt);
      // The whole state is replaced on every heartbeat, as before.
      const data = {
        ...runtime,
        binding: binding ? asJson(binding) : Prisma.DbNull,
        bindingRequests: asJson(normalizeDeviceBindingRequests(source.deviceBindingRequests)),
        connectionAudit: audit ? asJson(audit) : Prisma.DbNull,
        connectedAt: runtime.connectedAt ?? null,
        lastHeartbeatAt: runtime.lastHeartbeatAt ?? null,
        lastDisconnectAt: runtime.lastDisconnectAt ?? null,
      };
      const remoteSupport = normalizeRemoteSupport(source.remoteSupport);

      await this.db.$transaction(async (tx) => {
        const previous = await tx.moduloDeviceState.findUnique({ where: { moduloId }, select: { heartbeatStatus: true } });
        await tx.moduloDeviceState.upsert({ where: { moduloId }, create: { moduloId, ...data }, update: data });
        // History of connection: only real changes; a module's first report is not one.
        if (previous && previous.heartbeatStatus !== data.heartbeatStatus) {
          await tx.connectionEvent.create({ data: {
            proyectoId: payload.proyectoId, installationId: payload.installationId, moduloId,
            fromStatus: previous.heartbeatStatus, toStatus: data.heartbeatStatus, occurredAt: changedAt,
          } });
        }
        if (remoteSupport) {
          const support = {
            provider: remoteSupport.provider,
            enabled: remoteSupport.enabled,
            deviceName: remoteSupport.deviceName,
            deviceId: remoteSupport.deviceId,
            groupId: remoteSupport.groupId,
            baseUrl: remoteSupport.baseUrl,
            supportUrl: remoteSupport.supportUrl,
            desktopUrl: remoteSupport.desktopUrl,
            terminalUrl: remoteSupport.terminalUrl,
            linkedAt: remoteSupport.linkedAt ?? null,
            updatedAt: remoteSupport.updatedAt,
          };
          await tx.moduloRemoteSupport.upsert({ where: { moduloId }, create: { moduloId, ...support }, update: support });
        }
      });
    }
  }
}
