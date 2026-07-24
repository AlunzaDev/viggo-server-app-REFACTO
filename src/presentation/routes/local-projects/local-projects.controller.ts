import { Request, Response } from "express";
import { envs } from "../../../config";
import { ProyectoModel } from "../../../data/mongo/models/parking/proyecto.schema";
import { ErrorService } from "../../services/error.service";

const buildLocalUrl = (baseUrl: string, path: string) =>
  `${baseUrl.replace(/\/+$/, "")}${path}`;

export class LocalProjectsController {
  getSnapshot = async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId ?? "").trim();
      if (!projectId) return res.status(400).json({ error: "projectId es requerido" });

      const proyecto = await ProyectoModel.findById(projectId).lean();
      if (!proyecto) return res.status(404).json({ error: "Proyecto no encontrado" });

      const localApiBaseUrl = String(proyecto.localApiBaseUrl ?? "").trim();
      if (!localApiBaseUrl) {
        return res.status(409).json({
          error: "El proyecto no tiene localApiBaseUrl configurado",
        });
      }

      const params = new URLSearchParams();
      params.set("proyectoId", projectId);
      if (req.query.from) params.set("from", String(req.query.from));
      if (req.query.to) params.set("to", String(req.query.to));

      const response = await fetch(
        buildLocalUrl(localApiBaseUrl, `/api/local-reports/snapshot?${params.toString()}`),
        {
          headers: {
            Authorization: `Bearer ${envs.SYNC_SERVICE_TOKEN}`,
            "X-Viggo-Sync-Source": "nubeadmin-direct-query",
          },
        },
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        return res.status(response.status).json({
          error: (data as { error?: unknown }).error ?? "LOCALOPE no pudo responder el snapshot",
          localStatus: response.status,
        });
      }

      return res.status(200).json({
        project: {
          id: String(proyecto._id),
          nombre: proyecto.nombre,
          identificador: proyecto.identificador,
          localApiBaseUrl,
        },
        snapshot: data,
      });
    } catch (_error) {
      return ErrorService.handleApiError(
        new Error("No se pudo conectar con LOCALOPE para este proyecto"),
        res,
      );
    }
  };
}
