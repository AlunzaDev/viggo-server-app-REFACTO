import type { HeartbeatOverviewDatasource } from "../../../domain/datasources/heartbeat/heartbeat-overview.datasource";
import { HeartbeatOverviewRepository } from "../../../domain/repositories/heartbeat/heartbeat-overview.repository";

export class HeartbeatOverviewRepositoryImpl implements HeartbeatOverviewRepository {
  constructor(private readonly datasource: HeartbeatOverviewDatasource) {}

  listProjects(projectIds: string[] | null) {
    return this.datasource.listProjects(projectIds);
  }
}
