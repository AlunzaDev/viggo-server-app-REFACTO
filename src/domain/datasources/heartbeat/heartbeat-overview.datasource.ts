/** What the cloud holds about one parking's heartbeat, as stored (no rules applied). */
export interface ProjectHeartbeatRow {
  proyectoId: string;
  nombre: string;
  identificador: string;
  ciudad: string;
  /** As stored: a point [lon, lat] or an area [[lon, lat], ...]. */
  coordinates: unknown;
  /** The approved installation seen most recently; null when the parking has none. */
  installationId: string | null;
  /** Last time that installation asked for commands. */
  lastSeenAt: number | null;
  /** When its last heartbeat snapshot arrived. */
  snapshotReceivedAt: number | null;
  /** Active modules by the heartbeat status OPERATIVO reported; a module never reported is pending. */
  modules: { total: number; online: number; offline: number; pending: number };
  lastHeartbeatAt: number | null;
}

export abstract class HeartbeatOverviewDatasource {
  /** Every active parking, or only `projectIds` when given; one query for all of them. */
  abstract listProjects(projectIds: string[] | null): Promise<ProjectHeartbeatRow[]>;
}
