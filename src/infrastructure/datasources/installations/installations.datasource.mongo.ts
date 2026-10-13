import { LocalInstallationRequestModel } from "../../../data/mongo/models/system/local-installation-request.schema";
import { ProyectoModel } from "../../../data/mongo/models/parking/proyecto.schema";
import {
  InstallationsDatasource,
  type InstallationConnectivitySummary,
  type InstallationReviewPayload,
  type LocalInstallationRecord,
} from "../../../domain/datasources/installations/installations.datasource";

const asRecord = (document: unknown) => document as LocalInstallationRecord;

export class InstallationsMongoDatasource implements InstallationsDatasource {
  async findByInstallationId(installationId: string): Promise<LocalInstallationRecord | null> {
    return asRecord(await LocalInstallationRequestModel.findOne({ installationId }).lean());
  }

  async findApprovedByProyectoId(proyectoId: string): Promise<LocalInstallationRecord | null> {
    return asRecord(
      await LocalInstallationRequestModel.findOne({ proyectoId, status: "approved" }).lean(),
    );
  }

  async findApprovedLinkTokenHash(installationId: string): Promise<string> {
    const installation = await LocalInstallationRequestModel.findOne({
      installationId,
      status: "approved",
    }).lean();
    const project = installation
      ? await ProyectoModel.findById(installation.proyectoId)
          .select({ installationLinkTokenHash: 1 })
          .lean()
      : null;
    return String(project?.installationLinkTokenHash ?? "");
  }

  async recordCommandPoll(installationId: string, now: number): Promise<void> {
    await LocalInstallationRequestModel.updateOne(
      { installationId, status: "approved" },
      { $set: { lastCommandPollAt: now, updatedAt: now } },
    );
  }

  async getConnectivitySummary(
    onlineSince: number,
    degradedSince: number,
  ): Promise<InstallationConnectivitySummary> {
    const [approved, online, degraded, offline] = await Promise.all([
      LocalInstallationRequestModel.countDocuments({ status: "approved" }),
      LocalInstallationRequestModel.countDocuments({
        status: "approved",
        lastCommandPollAt: { $gte: onlineSince },
      }),
      LocalInstallationRequestModel.countDocuments({
        status: "approved",
        lastCommandPollAt: { $lt: onlineSince, $gte: degradedSince },
      }),
      LocalInstallationRequestModel.find({
        status: "approved",
        lastCommandPollAt: { $lt: degradedSince },
      }).lean(),
    ]);
    return { approved, online, degraded, offline: offline.map(asRecord) };
  }

  getRequests() {
    return LocalInstallationRequestModel.find().sort({ updatedAt: -1 }).lean();
  }

  private async updateRequestStatus(
    requestId: string,
    payload: InstallationReviewPayload,
    status: "pending" | "rejected",
    note: string,
  ) {
    const request = await LocalInstallationRequestModel.findById(requestId);
    if (!request) return null;

    request.status = status;
    request.reviewedByUserId = payload.userId;
    request.reviewedByUserName = payload.userName;
    request.reviewedAt = Date.now();
    request.reviewNote = note;
    request.syncTokenHash = "";
    request.syncTokenIssuedAt = 0;
    request.syncTokenDeliveredAt = 0;
    request.updatedAt = Date.now();
    await request.save();

    return request.toJSON();
  }

  async approveRequest(payload: InstallationReviewPayload) {
    const request = await LocalInstallationRequestModel.findById(payload.requestId);
    if (!request) return null;

    const proyecto = await ProyectoModel.findById(request.proyectoId);
    if (!proyecto) return { missingProject: true as const };

    proyecto.localApiBaseUrl = request.localApiBaseUrl || proyecto.localApiBaseUrl;
    proyecto.serverIp = request.serverIp || proyecto.serverIp;
    proyecto.serverMac = request.serverMac || proyecto.serverMac;
    await proyecto.save();

    request.status = "approved";
    request.reviewedByUserId = payload.userId;
    request.reviewedByUserName = payload.userName;
    request.reviewedAt = Date.now();
    request.reviewNote = payload.note ?? "";
    request.syncTokenHash = "";
    request.syncTokenIssuedAt = 0;
    request.syncTokenDeliveredAt = 0;
    request.updatedAt = Date.now();
    await request.save();

    return request.toJSON();
  }

  rejectRequest(payload: InstallationReviewPayload & { note: string }) {
    return LocalInstallationRequestModel.findByIdAndUpdate(
      payload.requestId,
      {
        status: "rejected",
        reviewedByUserId: payload.userId,
        reviewedByUserName: payload.userName,
        reviewedAt: Date.now(),
        reviewNote: payload.note,
        updatedAt: Date.now(),
      },
      { new: true },
    ).lean();
  }

  unlinkTemporary(payload: InstallationReviewPayload) {
    return this.updateRequestStatus(
      payload.requestId,
      payload,
      "pending",
      payload.note?.trim() || "Desvinculacion temporal solicitada desde administrativo",
    );
  }

  unlinkPermanent(payload: InstallationReviewPayload) {
    return this.updateRequestStatus(
      payload.requestId,
      payload,
      "rejected",
      payload.note?.trim() || "Desvinculacion definitiva solicitada desde administrativo",
    );
  }
}
