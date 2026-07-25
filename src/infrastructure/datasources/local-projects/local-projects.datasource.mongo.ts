import { envs } from "../../../config";
import { ProyectoModel } from "../../../data/mongo/models/parking/proyecto.schema";
import {
  LocalProjectsDatasource,
  type LocalProjectSnapshotPayload,
} from "../../../domain/datasources/local-projects/local-projects.datasource";

const buildLocalUrl = (baseUrl: string, path: string) =>
  `${baseUrl.replace(/\/+$/, "")}${path}`;

export class LocalProjectsMongoDatasource implements LocalProjectsDatasource {
  async getSnapshot(payload: LocalProjectSnapshotPayload) {
    const proyecto = await ProyectoModel.findById(payload.projectId).lean();
    if (!proyecto) return { status: "missing-project" as const };

    const localApiBaseUrl = String(proyecto.localApiBaseUrl ?? "").trim();
    if (!localApiBaseUrl) return { status: "missing-local-url" as const };

    const params = new URLSearchParams();
    params.set("proyectoId", payload.projectId);
    if (payload.from) params.set("from", payload.from);
    if (payload.to) params.set("to", payload.to);

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
      return {
        status: "local-error" as const,
        localStatus: response.status,
        error: (data as { error?: unknown }).error ?? "LOCALOPE no pudo responder el snapshot",
      };
    }

    return {
      status: "ok" as const,
      project: {
        id: String(proyecto._id),
        nombre: proyecto.nombre,
        identificador: proyecto.identificador,
        localApiBaseUrl,
      },
      snapshot: data,
    };
  }
}
