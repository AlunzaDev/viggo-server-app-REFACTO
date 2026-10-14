import { PostgresDatabase } from "../../../data/postgres";
import type { Prisma } from "../../../generated/prisma/client";
import {
  InstallationsDatasource,
  type InstallationConnectivitySummary,
  type InstallationReviewPayload,
  type InstallationUnlinkPayload,
  type LocalInstallationRecord,
} from "../../../domain/datasources/installations/installations.datasource";
import { isUuid } from "../postgres/prisma-errors";

const installationInclude = {
  proyecto: { select: { nombre: true, identificador: true } },
} satisfies Prisma.LocalInstallationInclude;

type InstallationRow = Prisma.LocalInstallationGetPayload<{ include: typeof installationInclude }>;

const ms = (value: Date | null) => (value ? value.getTime() : 0);

/** Same shape the API returned from Mongo (epoch ms, 0 when unset; sync token hash never exposed). */
export const toInstallationRecord = (row: InstallationRow): LocalInstallationRecord => ({
  id: row.id,
  installationId: row.installationId,
  proyectoId: row.proyectoId,
  proyectoNombre: row.proyecto.nombre,
  proyectoIdentificador: row.proyecto.identificador,
  localApiBaseUrl: row.localApiBaseUrl,
  serverIp: row.serverIp,
  serverMac: row.serverMac,
  browserCoordinates:
    row.browserLongitude !== null && row.browserLatitude !== null
      ? [row.browserLongitude, row.browserLatitude]
      : undefined,
  browserLocationAccuracy: row.browserLocationAccuracy ?? undefined,
  browserLocationCapturedAt: row.browserLocationCapturedAt?.getTime(),
  status: row.status,
  requestedByUserId: row.requestedByUserId,
  requestedByUserName: row.requestedByUserName,
  requestedAt: ms(row.requestedAt),
  reviewedByUserId: row.reviewedById ?? "",
  reviewedByUserName: row.reviewedByUserName,
  reviewedAt: row.reviewedAt?.getTime(),
  reviewNote: row.reviewNote,
  syncTokenIssuedAt: ms(row.syncTokenIssuedAt),
  syncTokenDeliveredAt: ms(row.syncTokenDeliveredAt),
  lastCommandPollAt: ms(row.lastCommandPollAt),
  updatedAt: ms(row.updatedAt),
});

const reviewFields = (payload: InstallationReviewPayload, note: string) => ({
  reviewedById: isUuid(payload.userId) ? payload.userId : null,
  reviewedByUserName: payload.userName,
  reviewedAt: new Date(),
  reviewNote: note,
});

const clearSyncToken = { syncTokenHash: "", syncTokenIssuedAt: null, syncTokenDeliveredAt: null };

export class InstallationsPostgresDatasource implements InstallationsDatasource {
  private get installations() {
    return PostgresDatabase.client.localInstallation;
  }

  async getRequests() {
    const rows = await this.installations.findMany({
      include: installationInclude,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    });
    return rows.map(toInstallationRecord);
  }

  async approveRequest(payload: InstallationReviewPayload) {
    if (!isUuid(payload.requestId)) return null;
    const request = await this.installations.findUnique({ where: { id: payload.requestId } });
    if (!request) return null;

    return PostgresDatabase.client.$transaction(async (tx) => {
      const proyecto = await tx.proyecto.findUnique({ where: { id: request.proyectoId } });
      if (!proyecto) return { missingProject: true as const };

      await tx.proyecto.update({
        where: { id: proyecto.id },
        data: {
          localApiBaseUrl: request.localApiBaseUrl || proyecto.localApiBaseUrl,
          serverIp: request.serverIp || proyecto.serverIp,
          serverMac: request.serverMac || proyecto.serverMac,
        },
      });
      const row = await tx.localInstallation.update({
        where: { id: request.id },
        data: { status: "approved", ...reviewFields(payload, payload.note ?? ""), ...clearSyncToken },
        include: installationInclude,
      });
      return toInstallationRecord(row);
    });
  }

  async rejectRequest(payload: InstallationReviewPayload & { note: string }) {
    return this.setStatus(payload.requestId, { status: "rejected", ...reviewFields(payload, payload.note) });
  }

  unlinkTemporary(payload: InstallationUnlinkPayload) {
    return this.setStatus(payload.requestId, {
      status: "pending",
      ...reviewFields(payload, payload.note?.trim() || "Desvinculacion temporal solicitada desde administrativo"),
      ...clearSyncToken,
    });
  }

  unlinkPermanent(payload: InstallationUnlinkPayload) {
    return this.setStatus(payload.requestId, {
      status: "rejected",
      ...reviewFields(payload, payload.note?.trim() || "Desvinculacion definitiva solicitada desde administrativo"),
      ...clearSyncToken,
    });
  }

  async findByInstallationId(installationId: string): Promise<LocalInstallationRecord | null> {
    const row = await this.installations.findUnique({ where: { installationId }, include: installationInclude });
    return row ? toInstallationRecord(row) : null;
  }

  async findApprovedByProyectoId(proyectoId: string): Promise<LocalInstallationRecord | null> {
    if (!isUuid(proyectoId)) return null;
    const row = await this.installations.findFirst({
      where: { proyectoId, status: "approved" },
      include: installationInclude,
      orderBy: { updatedAt: "desc" },
    });
    return row ? toInstallationRecord(row) : null;
  }

  async findApprovedBySyncTokenHash(installationId: string, syncTokenHash: string) {
    if (!installationId || !syncTokenHash) return null;
    return this.installations.findFirst({
      where: { installationId, syncTokenHash, status: "approved" },
      select: { installationId: true, proyectoId: true },
    });
  }

  async recordCommandPoll(installationId: string, now: number): Promise<void> {
    await this.installations.updateMany({
      where: { installationId, status: "approved" },
      data: { lastCommandPollAt: new Date(now) },
    });
  }

  async getConnectivitySummary(onlineSince: number, degradedSince: number): Promise<InstallationConnectivitySummary> {
    const online = new Date(onlineSince);
    const degraded = new Date(degradedSince);
    const [approved, onlineCount, degradedCount, offline] = await Promise.all([
      this.installations.count({ where: { status: "approved" } }),
      this.installations.count({ where: { status: "approved", lastCommandPollAt: { gte: online } } }),
      this.installations.count({
        where: { status: "approved", lastCommandPollAt: { lt: online, gte: degraded } },
      }),
      // Never polled counts as offline (Mongo stored 0 for that case).
      this.installations.findMany({
        where: { status: "approved", OR: [{ lastCommandPollAt: { lt: degraded } }, { lastCommandPollAt: null }] },
        include: installationInclude,
      }),
    ]);
    return { approved, online: onlineCount, degraded: degradedCount, offline: offline.map(toInstallationRecord) };
  }

  private async setStatus(requestId: string, data: Prisma.LocalInstallationUncheckedUpdateInput) {
    if (!isUuid(requestId)) return null;
    if ((await this.installations.count({ where: { id: requestId } })) === 0) return null;
    const row = await this.installations.update({ where: { id: requestId }, data, include: installationInclude });
    return toInstallationRecord(row);
  }
}
