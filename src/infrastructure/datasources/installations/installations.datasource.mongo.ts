import { LocalInstallationRequestModel } from "../../../data/mongo/models/system/local-installation-request.schema";
import { ProyectoModel } from "../../../data/mongo/models/parking/proyecto.schema";
import {
  InstallationsDatasource,
  type InstallationReviewPayload,
} from "../../../domain/datasources/installations/installations.datasource";

export class InstallationsMongoDatasource implements InstallationsDatasource {
  getRequests() {
    return LocalInstallationRequestModel.find().sort({ updatedAt: -1 }).lean();
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
    request.syncTokenIssuedAt = undefined;
    request.syncTokenDeliveredAt = undefined;
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
}
