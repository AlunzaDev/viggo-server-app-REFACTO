import { Request, Response } from "express";
import { SyncRequest } from "../../middlewares/sync-auth.middleware";
import { ErrorService } from "../../services/error.service";
import { SyncService } from "../../services/sync/sync.service";

export class SyncController {
  constructor(private readonly service: SyncService) {}

  status = async (req: Request, res: Response) => {
    return res.status(200).json({
      service: "viggo-nubeadmin-sync",
      installationId: (req as SyncRequest).installationId,
      status: "ok",
      serverTime: Date.now(),
    });
  };

  getConfiguration = async (req: Request, res: Response) => {
    try {
      const result = await this.service.getConfiguration(String(req.params.proyectoId));
      if (!result) return res.status(404).json({ error: "Proyecto no encontrado" });
      return res.status(200).json(result);
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getProjectsCatalog = async (_req: Request, res: Response) => {
    try {
      const proyectos = await this.service.getProjectsCatalog();
      return res.status(200).json({ proyectos });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getAccessSnapshot = async (req: Request, res: Response) => {
    try {
      const result = await this.service.getAccessSnapshot(String(req.params.proyectoId));
      if (!result) return res.status(404).json({ error: "Proyecto no encontrado" });
      return res.status(200).json(result);
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getAccessUserByCorreo = async (req: Request, res: Response) => {
    try {
      const correo = String(req.params.correo ?? "").trim().toLowerCase();
      if (!correo) return res.status(400).json({ error: "correo es requerido" });
      const user = await this.service.getAccessUserByCorreo(correo);
      if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
      return res.status(200).json({ user });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getAccessUserByTelefono = async (req: Request, res: Response) => {
    try {
      const telefono = String(req.params.telefono ?? "").trim();
      if (!telefono) return res.status(400).json({ error: "telefono es requerido" });
      const user = await this.service.getAccessUserByTelefono(telefono);
      if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
      return res.status(200).json({ user });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  requestInstallationLink = async (req: Request, res: Response) => {
    try {
      const installationId = (req as SyncRequest).installationId!;
      const body = req.body as Record<string, unknown>;
      const proyectoId = String(body.proyectoId ?? "").trim();
      const installationLinkToken = String(body.installationLinkToken ?? "").trim();
      if (!proyectoId) return res.status(400).json({ error: "proyectoId es requerido" });
      if (!installationLinkToken) {
        return res.status(400).json({ error: "Token de vinculacion requerido" });
      }

      const result = await this.service.requestInstallationLink({
        installationId,
        proyectoId,
        installationLinkToken,
        localApiBaseUrl: String(body.localApiBaseUrl ?? ""),
        serverIp: String(body.serverIp ?? ""),
        serverMac: String(body.serverMac ?? ""),
        requestedByUserId: String(body.requestedByUserId ?? ""),
        requestedByUserName: String(body.requestedByUserName ?? ""),
      });

      if (result.status === "missing-project") {
        return res.status(404).json({ error: "Proyecto no encontrado" });
      }
      if (result.status === "missing-token") {
        return res.status(409).json({ error: "El proyecto no tiene token de vinculacion generado" });
      }
      if (result.status === "invalid-token") {
        return res.status(403).json({ error: "Token de vinculacion invalido" });
      }
      if (result.status === "already-approved-other-project") {
        return res.status(409).json({
          error: "Esta instalacion ya fue aprobada para otro proyecto",
          request: result.request,
        });
      }

      return res.status(202).json({ request: result.request });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getInstallationRequestStatus = async (req: Request, res: Response) => {
    try {
      const installationId = (req as SyncRequest).installationId!;
      const result = await this.service.getInstallationRequestStatus(installationId);
      return res.status(200).json(result);
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  receiveEvent = async (req: Request, res: Response) => {
    try {
      const installationId = (req as SyncRequest).installationId!;
      const body = req.body as Record<string, unknown>;
      const eventId = String(body.eventId ?? "").trim();
      const proyectoId = String(body.proyectoId ?? "").trim();
      const eventType = String(body.eventType ?? "").trim();
      const aggregateId = String(body.aggregateId ?? "").trim();
      const occurredAt = Number(body.occurredAt);
      const payload = body.payload;

      if (!eventId || !proyectoId || !eventType || !aggregateId) {
        return res.status(400).json({
          error: "eventId, proyectoId, eventType y aggregateId son requeridos",
        });
      }
      if (!Number.isFinite(occurredAt)) {
        return res.status(400).json({ error: "occurredAt debe ser numerico" });
      }
      if (!payload || typeof payload !== "object") {
        return res.status(400).json({ error: "payload debe ser un objeto" });
      }

      const result = await this.service.receiveEvent({
        eventId,
        installationId,
        proyectoId,
        eventType,
        aggregateId,
        occurredAt,
        payload,
      });

      return res.status(result.duplicate ? 200 : 202).json(result);
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        return res.status(200).json({ accepted: true, duplicate: true });
      }
      return ErrorService.handleApiError(error, res);
    }
  };
}
