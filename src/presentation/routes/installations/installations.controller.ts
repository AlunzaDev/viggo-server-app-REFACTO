import { Request, Response } from "express";
import { getAuthenticatedRequestUser } from "../../middlewares";
import { ErrorService } from "../../services/error.service";
import { InstallationsService } from "../../services/installations/installations.service";

const getReviewerName = (user: ReturnType<typeof getAuthenticatedRequestUser>) =>
  [user?.nombre, user?.apellido].filter(Boolean).join(" ").trim();

export class InstallationsController {
  constructor(private readonly service: InstallationsService) {}

  getRequests = async (_req: Request, res: Response) => {
    try {
      const requests = await this.service.getRequests();
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

      const request = await this.service.approveRequest({
        requestId,
        userId: user?.id ?? "",
        userName: getReviewerName(user),
        note,
      });
      if (!request) return res.status(404).json({ error: "Solicitud no encontrada" });
      if ("missingProject" in request) {
        return res.status(404).json({ error: "Proyecto no encontrado" });
      }
      return res.status(200).json({ request });
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

      const request = await this.service.rejectRequest({
        requestId,
        userId: user?.id ?? "",
        userName: getReviewerName(user),
        note,
      });

      if (!request) return res.status(404).json({ error: "Solicitud no encontrada" });
      return res.status(200).json({ request });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };
}
