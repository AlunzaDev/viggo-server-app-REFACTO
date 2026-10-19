import {
  LocalProjectsDatasource,
  type LocalDeviceBindingActionPayload,
  type LocalProjectSnapshotPayload,
} from "../../../domain/datasources/local-projects/local-projects.datasource";

export interface LocalProjectRef {
  id: string;
  nombre: string;
  identificador: string;
  localApiBaseUrl: string;
  /**
   * Token to call the linked installation's local API (derived from its own sync token).
   * Empty until the installation receives its token; there is no shared token.
   */
  adminCallToken: string;
}

export interface HeartbeatSnapshotData {
  installationId: string;
  source: string;
  generatedAt: number;
  receivedAt: number;
  summary: Record<string, unknown>;
  modules: Array<Record<string, unknown>>;
  metadata: Record<string, unknown>;
}

/** Storage needed by the live-query flows: the project and its last heartbeat. */
export interface LocalProjectsStore {
  findProject(projectId: string): Promise<LocalProjectRef | null>;
  findHeartbeat(projectId: string): Promise<Record<string, unknown> | null>;
  saveHeartbeat(projectId: string, data: HeartbeatSnapshotData): Promise<Record<string, unknown>>;
}

const buildLocalUrl = (baseUrl: string, path: string) =>
  `${baseUrl.replace(/\/+$/, "")}${path}`;

const NO_ADMIN_CALL_TOKEN = {
  ok: false as const,
  localStatus: 503,
  error: "La instalacion local aun no tiene credenciales para recibir llamadas; rota su token desde Instalaciones",
};

const fetchLocalHeartbeat = async (baseUrl: string, projectId: string, adminCallToken: string) => {
  if (!adminCallToken) return NO_ADMIN_CALL_TOKEN;
  const response = await fetch(
    buildLocalUrl(baseUrl, `/api/local-reports/heartbeat?proyectoId=${encodeURIComponent(projectId)}`),
    {
      headers: {
        Authorization: `Bearer ${adminCallToken}`,
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

const callLocalDeviceBindingAction = async (
  baseUrl: string,
  action: "approve" | "reject",
  payload: LocalDeviceBindingActionPayload,
  adminCallToken: string,
) => {
  if (!adminCallToken) return NO_ADMIN_CALL_TOKEN;
  const response = await fetch(
    buildLocalUrl(
      baseUrl,
      `/api/sync/modules/${encodeURIComponent(payload.moduleId)}/device-binding/${action}`,
    ),
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${adminCallToken}`,
        "Content-Type": "application/json",
        "X-Viggo-Sync-Source": "administrativo-device-binding",
      },
      body: JSON.stringify({
        fingerprint: payload.fingerprint,
        resolvedByUserId: payload.resolvedByUserId,
        resolvedByUserName: payload.resolvedByUserName,
        notes: payload.notes,
      }),
    },
  );
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    return {
      ok: false as const,
      localStatus: response.status,
      error:
        (data as { error?: unknown }).error ??
        `OPERATIVO no pudo ${action === "approve" ? "aprobar" : "rechazar"} la vinculacion`,
    };
  }

  return {
    ok: true as const,
    data,
  };
};

/** Queries the parking's OPERATIVO server directly; persistence goes through the store. */
export class LocalProjectsHttpDatasource implements LocalProjectsDatasource {
  constructor(private readonly store: LocalProjectsStore) {}

  async getSnapshot(payload: LocalProjectSnapshotPayload) {
    const proyecto = await this.store.findProject(payload.projectId);
    if (!proyecto) return { status: "missing-project" as const };

    const localApiBaseUrl = String(proyecto.localApiBaseUrl ?? "").trim();
    if (!localApiBaseUrl) return { status: "missing-local-url" as const };

    const params = new URLSearchParams();
    params.set("proyectoId", payload.projectId);
    if (payload.from) params.set("from", payload.from);
    if (payload.to) params.set("to", payload.to);

    if (!proyecto.adminCallToken) {
      return { status: "local-error" as const, localStatus: NO_ADMIN_CALL_TOKEN.localStatus, error: NO_ADMIN_CALL_TOKEN.error };
    }
    const response = await fetch(
      buildLocalUrl(localApiBaseUrl, `/api/local-reports/snapshot?${params.toString()}`),
      {
        headers: {
          Authorization: `Bearer ${proyecto.adminCallToken}`,
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
        id: proyecto.id,
        nombre: proyecto.nombre,
        identificador: proyecto.identificador,
        localApiBaseUrl,
      },
      snapshot: data,
    };
  }

  async getHeartbeat(projectId: string) {
    const proyecto = await this.store.findProject(projectId);
    if (!proyecto) return { status: "missing-project" as const };

    const storedSnapshot = await this.store.findHeartbeat(projectId);
    const localApiBaseUrl = String(proyecto.localApiBaseUrl ?? "").trim();

    if (!localApiBaseUrl) {
      return {
        status: "missing-local-url" as const,
        snapshot: storedSnapshot
          ? {
              mode: "snapshot",
              source: "stored-snapshot",
              project: {
                id: proyecto.id,
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
      const liveResult = await fetchLocalHeartbeat(localApiBaseUrl, projectId, proyecto.adminCallToken);
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
                  id: proyecto.id,
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

      const persisted = await this.store.saveHeartbeat(projectId, {
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
      });

      return {
        status: "ok" as const,
        data: {
          mode: "live",
          source: "local-query",
          project: {
            id: proyecto.id,
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
                id: proyecto.id,
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

  async approveDeviceBinding(payload: LocalDeviceBindingActionPayload) {
    return this.resolveDeviceBinding("approve", payload);
  }

  async rejectDeviceBinding(payload: LocalDeviceBindingActionPayload) {
    return this.resolveDeviceBinding("reject", payload);
  }

  private async resolveDeviceBinding(
    action: "approve" | "reject",
    payload: LocalDeviceBindingActionPayload,
  ) {
    const proyecto = await this.store.findProject(payload.projectId);
    if (!proyecto) return { status: "missing-project" as const };

    const localApiBaseUrl = String(proyecto.localApiBaseUrl ?? "").trim();
    if (!localApiBaseUrl) return { status: "missing-local-url" as const };

    const result = await callLocalDeviceBindingAction(
      localApiBaseUrl,
      action,
      payload,
      proyecto.adminCallToken,
    );

    if (!result.ok) {
      return {
        status: "local-error" as const,
        localStatus: result.localStatus,
        error: result.error,
      };
    }

    const refreshedHeartbeat = await this.getHeartbeat(payload.projectId);

    return {
      status: "ok" as const,
      action,
      local: result.data,
      heartbeat:
        refreshedHeartbeat.status === "ok" ? refreshedHeartbeat.data : null,
    };
  }
}
