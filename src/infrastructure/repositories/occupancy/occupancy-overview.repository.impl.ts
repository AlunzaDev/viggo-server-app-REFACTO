import type { OccupancyOverviewDatasource } from "../../../domain/datasources/occupancy/occupancy-overview.datasource";
import { OccupancyOverviewRepository } from "../../../domain/repositories/occupancy/occupancy-overview.repository";

export class OccupancyOverviewRepositoryImpl implements OccupancyOverviewRepository {
  constructor(private readonly datasource: OccupancyOverviewDatasource) {}

  listProjects(projectIds: string[] | null, now: number) {
    return this.datasource.listProjects(projectIds, now);
  }

  findProject(proyectoId: string) {
    return this.datasource.findProject(proyectoId);
  }

  todayByHour(proyectoId: string, zone: string, now: number) {
    return this.datasource.todayByHour(proyectoId, zone, now);
  }
}
