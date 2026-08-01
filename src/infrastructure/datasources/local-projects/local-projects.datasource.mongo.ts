import { envs } from "../../../config";
import { ProjectHeartbeatSnapshotModel } from "../../../data/mongo/models/system/project-heartbeat-snapshot.schema";
import { ProyectoModel } from "../../../data/mongo/models/parking/proyecto.schema";
import {
  LocalProjectsDatasource,
  type LocalProjectSnapshotPayload,
} from "../../../domain/datasources/local-projects/local-projects.datasource";

const buildLocalUrl = (baseUrl: string, path: string) =>
  `${baseUrl.replace(/\/+$/, "")}${path}`;

const fetchLocalHeartbeat = async (baseUrl: string, projectId: string) => {
  const response = await fetch(
    buildLocalUrl(baseUrl, `/api/local-reports/heartbeat?proyectoId=${encodeURIComponent(projectId)}`),
    {
      headers: {
        Authorization: `Bearer ${envs.SYNC_SERVICE_TOKEN}`,
        "X-Viggo-Sync-Source": "administrativo-direct-query",
      },
    },
  );
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    return {
      ok: false as const,
      localStatus: response.status,
      error: (data as { error?: unknown }).error ?? "OPERATIVO no pudo responder el heartbeat",
    };
  }

  return {
    ok: true as const,
    data,
  };
};

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
          "X-Viggo-Sync-Source": "administrativo-direct-query",
        },
      },
    );
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        status: "local-error" as const,
        localStatus: response.status,
        error: (data as { error?: unknown }).error ?? "OPERATIVO no pudo responder el snapshot",
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

  async getHeartbeat(projectId: string) {
    const proyecto = await ProyectoModel.findById(projectId).lean();
    if (!proyecto) return { status: "missing-project" as const };

    const storedSnapshot = await ProjectHeartbeatSnapshotModel.findOne({ proyectoId: projectId })
      .lean();
    const localApiBaseUrl = String(proyecto.localApiBaseUrl ?? "").trim();

    if (!localApiBaseUrl) {
      return {
        status: "missing-local-url" as const,
        snapshot: storedSnapshot
          ? {
              mode: "snapshot",
              source: "stored-snapshot",
              project: {
                id: String(proyecto._id),
                nombre: proyecto.nombre,
                identificador: proyecto.identificador,
                localApiBaseUrl: "",
              },
              snapshot: storedSnapshot,
            }
          : null,
        error: "El proyecto no tiene URL local configurada",
      };
    }

    try {
      const liveResult = await fetchLocalHeartbeat(localApiBaseUrl, projectId);
      if (!liveResult.ok) {
        return {
          status: "local-error" as const,
          localStatus: liveResult.localStatus,
          error: liveResult.error,
          snapshot: storedSnapshot
            ? {
                mode: "snapshot",
                source: "stored-snapshot",
                project: {
                  id: String(proyecto._id),
                  nombre: proyecto.nombre,
                  identificador: proyecto.identificador,
                  localApiBaseUrl,
                },
                snapshot: storedSnapshot,
              }
            : null,
        };
      }

      const payload = liveResult.data as {
        snapshot?: {
          generatedAt?: number;
          source?: string;
          summary?: Record<string, unknown>;
          modules?: Array<Record<string, unknown>>;
          metadata?: Record<string, unknown>;
        };
      };
      const snapshot = payload.snapshot ?? {};
      const generatedAt = Number(snapshot.generatedAt ?? Date.now());
      const summary =
        snapshot.summary && typeof snapshot.summary === "object"
          ? snapshot.summary
          : {};
      const modules = Array.isArray(snapshot.modules) ? snapshot.modules : [];
      const metadata =
        snapshot.metadata && typeof snapshot.metadata === "object"
          ? snapshot.metadata
          : {};

      const persisted = await ProjectHeartbeatSnapshotModel.findOneAndUpdate(
        { proyectoId: projectId },
        {
          proyectoId: projectId,
          installationId: String((metadata as Record<string, unknown>).installationId ?? ""),
          source: String(snapshot.source ?? "admin-live-query"),
          generatedAt,
          receivedAt: Date.now(),
          summary,
          modules,
          metadata: {
            ...metadata,
            proyectoNombre: String(proyecto.nombre ?? ""),
            proyectoIdentificador: String(proyecto.identificador ?? ""),
          },
        },
        {
          new: true,
          upsert: true,
          setDefaultsOnInsert: true,
        },
      ).lean();

      return {
        status: "ok" as const,
        data: {
          mode: "live",
          source: "local-query",
          project: {
            id: String(proyecto._id),
            nombre: proyecto.nombre,
            identificador: proyecto.identificador,
            localApiBaseUrl,
          },
          snapshot: persisted,
          fallbackSnapshot: storedSnapshot ?? null,
        },
      };
    } catch (error) {
      return {
        status: "local-error" as const,
        localStatus: 503,
        error: error instanceof Error ? error.message : "No se pudo consultar el heartbeat en vivo",
        snapshot: storedSnapshot
          ? {
              mode: "snapshot",
              source: "stored-snapshot",
              project: {
                id: String(proyecto._id),
                nombre: proyecto.nombre,
                identificador: proyecto.identificador,
                localApiBaseUrl,
              },
              snapshot: storedSnapshot,
            }
          : null,
      };
    }
  }
}
