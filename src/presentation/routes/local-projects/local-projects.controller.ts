import { Request, Response } from "express";
import { ErrorService } from "../../services/error.service";
import { LocalProjectsService } from "../../services/local-projects/local-projects.service";

type LocalProjectAuthRequest = Request & {
  uid?: string;
  usuario?: {
    id?: string;
    nombre?: string;
    apellido?: string;
  };
};

export class LocalProjectsController {
  constructor(private readonly service: LocalProjectsService) {}

  getSnapshot = async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId ?? "").trim();
      if (!projectId) return res.status(400).json({ error: "projectId es requerido" });

      const result = await this.service.getSnapshot({
        projectId,
        from: req.query.from ? String(req.query.from) : undefined,
        to: req.query.to ? String(req.query.to) : undefined,
      });

      if (result.status === "missing-project") {
        return res.status(404).json({ error: "Proyecto no encontrado" });
      }
      if (result.status === "missing-local-url") {
        return res.status(409).json({ error: "El proyecto no tiene localApiBaseUrl configurado" });
      }
      if (result.status === "local-error") {
        return res.status(result.localStatus).json({
          error: result.error,
          localStatus: result.localStatus,
        });
      }

      return res.status(200).json({
        project: result.project,
        snapshot: result.snapshot,
      });
    } catch (_error) {
      return ErrorService.handleApiError(
        new Error("No se pudo conectar con la instalacion local de este proyecto"),
        res,
      );
    }
  };

  getHeartbeat = async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId ?? "").trim();
      if (!projectId) return res.status(400).json({ error: "projectId es requerido" });

      const result = await this.service.getHeartbeat(projectId);

      if (result.status === "missing-project") {
        return res.status(404).json({ error: "Proyecto no encontrado" });
      }

      if (result.status === "ok") {
        return res.status(200).json(result.data);
      }

      const statusCode = result.snapshot
        ? 200
        : result.status === "missing-local-url"
          ? 409
          : 503;

      if (result.snapshot) {
        return res.status(statusCode).json({
          ...result.snapshot,
          liveError: result.error ?? "No se pudo consultar el estado en vivo",
        });
      }

      return res.status(statusCode).json({
        mode: "unavailable",
        snapshot: null,
        liveError: result.error ?? "No se pudo consultar el estado en vivo",
      });
    } catch (_error) {
      return ErrorService.handleApiError(
        new Error("No se pudo obtener el heartbeat de este proyecto"),
        res,
      );
    }
  };

  approveDeviceBinding = async (req: Request, res: Response) => {
    return this.resolveDeviceBinding(req, res, "approve");
  };

  rejectDeviceBinding = async (req: Request, res: Response) => {
    return this.resolveDeviceBinding(req, res, "reject");
  };

  private async resolveDeviceBinding(
    req: Request,
    res: Response,
    action: "approve" | "reject",
  ) {
    try {
      const projectId = String(req.params.projectId ?? "").trim();
      const moduleId = String(req.params.moduleId ?? "").trim();
      if (!projectId) return res.status(400).json({ error: "projectId es requerido" });
      if (!moduleId) return res.status(400).json({ error: "moduleId es requerido" });

      const authReq = req as LocalProjectAuthRequest;
      const userName = [
        authReq.usuario?.nombre,
        authReq.usuario?.apellido,
      ]
        .filter(Boolean)
        .join(" ")
        .trim();

      const body = req.body as {
        fingerprint?: unknown;
        notes?: unknown;
      };

      const result =
        action === "approve"
          ? await this.service.approveDeviceBinding({
              projectId,
              moduleId,
              fingerprint:
                typeof body.fingerprint === "string"
                  ? body.fingerprint.trim()
                  : undefined,
              resolvedByUserId: authReq.uid ?? authReq.usuario?.id ?? "",
              resolvedByUserName: userName || "Administrativo",
              notes:
                typeof body.notes === "string"
                  ? body.notes.trim()
                  : "Aprobado desde Administrativo",
            })
          : await this.service.rejectDeviceBinding({
              projectId,
              moduleId,
              fingerprint:
                typeof body.fingerprint === "string"
                  ? body.fingerprint.trim()
                  : undefined,
              resolvedByUserId: authReq.uid ?? authReq.usuario?.id ?? "",
              resolvedByUserName: userName || "Administrativo",
              notes:
                typeof body.notes === "string"
                  ? body.notes.trim()
                  : "Rechazado desde Administrativo",
            });

      if (result.status === "missing-project") {
        return res.status(404).json({ error: "Proyecto no encontrado" });
      }
      if (result.status === "missing-local-url") {
        return res.status(409).json({ error: "El proyecto no tiene localApiBaseUrl configurado" });
      }
      if (result.status === "local-error") {
        return res.status(result.localStatus).json({
          error: result.error,
          localStatus: result.localStatus,
        });
      }

      return res.status(200).json(result);
    } catch (_error) {
      return ErrorService.handleApiError(
        new Error("No se pudo resolver la vinculacion en la instalacion local"),
        res,
      );
    }
  }
}
