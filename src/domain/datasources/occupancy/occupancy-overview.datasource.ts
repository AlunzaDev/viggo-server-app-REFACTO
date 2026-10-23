export interface ProjectOccupancyRow {
  proyectoId: string;
  nombre: string;
  identificador: string;
  ciudad: string;
  zonaHoraria: string;
  /** Null while not captured: then there is no percentage. */
  capacidad: number | null;
  /** Cars inside now, by type. */
  tickets: number;
  pensionados: number;
}

export interface OccupancyHourRow {
  /** "HH:00" in the parking's time zone. */
  hora: string;
  /** Cars inside at the start of the hour. */
  dentro: number;
  entradas: number;
  salidas: number;
}

export interface OccupancyProject {
  proyectoId: string;
  nombre: string;
  zonaHoraria: string;
  capacidad: number | null;
}

export abstract class OccupancyOverviewDatasource {
  /** Every active parking (or only `projectIds`) with the cars inside it now. */
  abstract listProjects(projectIds: string[] | null, now: number): Promise<ProjectOccupancyRow[]>;
  abstract findProject(proyectoId: string): Promise<OccupancyProject | null>;
  /** Today's hours so far in `zone`: cars inside at each hour's start, entries and exits. */
  abstract todayByHour(proyectoId: string, zone: string, now: number): Promise<OccupancyHourRow[]>;
}
