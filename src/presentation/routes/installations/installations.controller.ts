import { Request, Response } from "express";
import { LocalInstallationRequestModel } from "../../../data/mongo/models/system/local-installation-request.schema";
import { ProyectoModel } from "../../../data/mongo/models/parking/proyecto.schema";
import { getAuthenticatedRequestUser } from "../../middlewares";
import { ErrorService } from "../../services/error.service";

const getReviewerName = (user: ReturnType<typeof getAuthenticatedRequestUser>) =>
  [user?.nombre, user?.apellido].filter(Boolean).join(" ").trim();

export class InstallationsController {
  getRequests = async (_req: Request, res: Response) => {
    try {
      const requests = await LocalInstallationRequestModel.find()
        .sort({ updatedAt: -1 })
        .lean();

      return res.status(200).json({ requests });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  approveRequest = async (req: Request, res: Response) => {
    try {
      const requestId = String(req.params.id ?? "").trim();
      const note = String(req.body?.note ?? "").trim();
      const user = getAuthenticatedRequestUser(req);

      const request = await LocalInstallationRequestModel.findById(requestId);
      if (!request) return res.status(404).json({ error: "Solicitud no encontrada" });

      const proyecto = await ProyectoModel.findById(request.proyectoId);
      if (!proyecto) return res.status(404).json({ error: "Proyecto no encontrado" });

      proyecto.localApiBaseUrl = request.localApiBaseUrl || proyecto.localApiBaseUrl;
      proyecto.serverIp = request.serverIp || proyecto.serverIp;
      proyecto.serverMac = request.serverMac || proyecto.serverMac;
      await proyecto.save();

      request.status = "approved";
      request.reviewedByUserId = user?.id ?? "";
      request.reviewedByUserName = getReviewerName(user);
      request.reviewedAt = Date.now();
      request.reviewNote = note;
      request.syncTokenHash = "";
      request.syncTokenIssuedAt = undefined;
      request.syncTokenDeliveredAt = undefined;
      request.updatedAt = Date.now();
      await request.save();

      return res.status(200).json({ request: request.toJSON() });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  rejectRequest = async (req: Request, res: Response) => {
    try {
      const requestId = String(req.params.id ?? "").trim();
      const note = String(req.body?.note ?? "").trim();
      const user = getAuthenticatedRequestUser(req);

      if (!note) return res.status(400).json({ error: "La nota es obligatoria para rechazar" });

      const request = await LocalInstallationRequestModel.findByIdAndUpdate(
        requestId,
        {
          status: "rejected",
          reviewedByUserId: user?.id ?? "",
          reviewedByUserName: getReviewerName(user),
          reviewedAt: Date.now(),
          reviewNote: note,
          updatedAt: Date.now(),
        },
        { new: true },
      ).lean();

      if (!request) return res.status(404).json({ error: "Solicitud no encontrada" });
      return res.status(200).json({ request });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };
}
