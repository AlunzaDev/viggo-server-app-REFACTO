import type {
  OccupancyHourRow,
  OccupancyProject,
  ProjectOccupancyRow,
} from "../../datasources/occupancy/occupancy-overview.datasource";

export abstract class OccupancyOverviewRepository {
  abstract listProjects(projectIds: string[] | null, now: number): Promise<ProjectOccupancyRow[]>;
  abstract findProject(proyectoId: string): Promise<OccupancyProject | null>;
  abstract todayByHour(proyectoId: string, zone: string, now: number): Promise<OccupancyHourRow[]>;
}
