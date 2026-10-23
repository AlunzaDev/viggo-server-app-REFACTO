import type { ProjectHeartbeatRow } from "../../datasources/heartbeat/heartbeat-overview.datasource";

export abstract class HeartbeatOverviewRepository {
  abstract listProjects(projectIds: string[] | null): Promise<ProjectHeartbeatRow[]>;
}
