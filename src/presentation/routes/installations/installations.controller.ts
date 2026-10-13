import { Request, Response } from "express";
import { getAuthenticatedRequestUser } from "../../middlewares";
import { ErrorService } from "../../services/error.service";
import { InstallationsService } from "../../services/installations/installations.service";
import type { InstallationsRepository } from "../../../domain/repositories/installations/installations.repository";

const getReviewerName = (user: ReturnType<typeof getAuthenticatedRequestUser>) =>
  [user?.nombre, user?.apellido].filter(Boolean).join(" ").trim();
const onlineThresholdMs = 15_000;
const degradedThresholdMs = 60_000;

const getConnectivityStatus = (lastCommandPollAt: number, now: number) => {
  if (!lastCommandPollAt) return "offline";
  const ageMs = now - lastCommandPollAt;
  if (ageMs <= onlineThresholdMs) return "online";
  if (ageMs <= degradedThresholdMs) return "degraded";
  return "offline";
};

export class InstallationsController {
  constructor(
    private readonly service: InstallationsService,
    private readonly installations: InstallationsRepository,
  ) {}

  getRequests = async (_req: Request, res: Response) => {
    try {
      const requests = await this.service.getRequests();
      return res.status(200).json({ requests });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getConnectivity = async (req: Request, res: Response) => {
    try {
      const installationId = String(req.params.installationId ?? "").trim();
      const now = Date.now();
      const request = await this.installations.findByInstallationId(installationId);
      if (!request) return res.status(404).json({ error: "Instalacion no encontrada" });
      const lastCommandPollAt = Number(request.lastCommandPollAt ?? 0);
      return res.status(200).json({
        installationId: request.installationId,
        proyectoId: request.proyectoId,
        proyectoNombre: request.proyectoNombre,
        approvalStatus: request.status,
        connectivityStatus: getConnectivityStatus(lastCommandPollAt, now),
        lastCommandPollAt: lastCommandPollAt || null,
        lastCommandPollAgeMs: lastCommandPollAt ? now - lastCommandPollAt : null,
        onlineThresholdMs,
        degradedThresholdMs,
        serverTime: now,
      });
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

  unlinkTemporary = async (req: Request, res: Response) => {
    try {
      const requestId = String(req.params.id ?? "").trim();
      const note = String(req.body?.note ?? "").trim();
      const user = getAuthenticatedRequestUser(req);

      const request = await this.service.unlinkTemporary({
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

  unlinkPermanent = async (req: Request, res: Response) => {
    try {
      const requestId = String(req.params.id ?? "").trim();
      const note = String(req.body?.note ?? "").trim();
      const user = getAuthenticatedRequestUser(req);

      const request = await this.service.unlinkPermanent({
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
