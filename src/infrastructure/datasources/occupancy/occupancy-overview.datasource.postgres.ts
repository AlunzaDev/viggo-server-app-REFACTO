import { PENSION_MAX_STAY_MS, TICKET_MAX_STAY_MS } from "@alunzadev/viggo-contracts";
import { PostgresDatabase } from "../../../data/postgres";
import { Prisma } from "../../../generated/prisma/client";
import {
  OccupancyOverviewDatasource,
  type OccupancyHourRow,
  type OccupancyProject,
  type ProjectOccupancyRow,
} from "../../../domain/datasources/occupancy/occupancy-overview.datasource";
import { carsInsideNow } from "../../statistics/metrics/occupancy.metrics";
import { isUuid } from "../postgres/prisma-errors";

const ticketMaxStay = Prisma.sql`(${TICKET_MAX_STAY_MS} * interval '1 millisecond')`;
const pensionMaxStay = Prisma.sql`(${PENSION_MAX_STAY_MS} * interval '1 millisecond')`;

export class OccupancyOverviewPostgresDatasource extends OccupancyOverviewDatasource {
  private get db() {
    return PostgresDatabase.client;
  }

  async listProjects(projectIds: string[] | null, now: number): Promise<ProjectOccupancyRow[]> {
    const ids = projectIds?.filter(isUuid) ?? null;
    if (ids && !ids.length) return [];
    const projects = await this.db.proyecto.findMany({
      where: { estado: true, ...(ids ? { id: { in: ids } } : {}) },
      select: { id: true, nombre: true, identificador: true, ciudad: true, zonaHoraria: true, capacidad: true },
      orderBy: [{ nombre: "asc" }, { id: "asc" }],
    });
    // The same count of cars inside as the statistics (one query for every parking).
    const inside = new Map<string, { tickets: number; pensionados: number }>();
    for (const row of await carsInsideNow(this.db, projects.map((project) => project.id), now)) {
      const counts = inside.get(row.proyecto_id) ?? { tickets: 0, pensionados: 0 };
      if (row.tipo === "ticket") counts.tickets += row.valor;
      else counts.pensionados += row.valor;
      inside.set(row.proyecto_id, counts);
    }
    return projects.map((project) => ({
      proyectoId: project.id,
      nombre: project.nombre,
      identificador: project.identificador,
      ciudad: project.ciudad,
      zonaHoraria: project.zonaHoraria,
      capacidad: project.capacidad,
      ...(inside.get(project.id) ?? { tickets: 0, pensionados: 0 }),
    }));
  }

  async findProject(proyectoId: string): Promise<OccupancyProject | null> {
    if (!isUuid(proyectoId)) return null;
    const project = await this.db.proyecto.findFirst({
      where: { id: proyectoId, estado: true },
      select: { id: true, nombre: true, zonaHoraria: true, capacidad: true },
    });
    return project ? { proyectoId: project.id, nombre: project.nombre, zonaHoraria: project.zonaHoraria, capacidad: project.capacidad } : null;
  }

  /** As OPERATIVO's screen (GET /api/ocupacion there), read from the cloud's mirror tables. */
  async todayByHour(proyectoId: string, zone: string, now: number): Promise<OccupancyHourRow[]> {
    if (!isUuid(proyectoId)) return [];
    const at = new Date(now);
    return this.db.$queryRaw<OccupancyHourRow[]>(Prisma.sql`
      WITH hours AS (
        SELECT to_char(local, 'HH24') || ':00' AS hora, local AT TIME ZONE ${zone} AS h
        FROM generate_series(date_trunc('day', ${at}::timestamptz AT TIME ZONE ${zone}),
          date_trunc('hour', ${at}::timestamptz AT TIME ZONE ${zone}), interval '1 hour') AS local
      )
      SELECT hours.hora,
        (SELECT count(*)::int FROM operational_tickets t
          WHERE t.proyecto_id = ${proyectoId}::uuid AND t.hora_inicio <= hours.h AND t.hora_inicio > hours.h - ${ticketMaxStay}
            AND (t.hora_salida > hours.h OR (t.hora_salida IS NULL AND t.status IS DISTINCT FROM 'FRAUD')))
        + (SELECT count(*)::int FROM (
            SELECT DISTINCT ON (m.pension_pass_id) m.payload->>'tipo' AS tipo FROM operational_pension_moves m
            WHERE m.proyecto_id = ${proyectoId}::uuid AND m.fecha <= hours.h AND m.fecha > hours.h - ${pensionMaxStay}
            ORDER BY m.pension_pass_id, m.fecha DESC
          ) last WHERE last.tipo LIKE 'ENTRADA%') AS dentro,
        (SELECT count(*)::int FROM operational_tickets t
          WHERE t.proyecto_id = ${proyectoId}::uuid AND t.hora_inicio >= hours.h AND t.hora_inicio < hours.h + interval '1 hour')
        + (SELECT count(*)::int FROM operational_pension_moves m
          WHERE m.proyecto_id = ${proyectoId}::uuid AND m.payload->>'tipo' LIKE 'ENTRADA%' AND m.fecha >= hours.h AND m.fecha < hours.h + interval '1 hour') AS entradas,
        (SELECT count(*)::int FROM operational_tickets t
          WHERE t.proyecto_id = ${proyectoId}::uuid AND t.hora_salida >= hours.h AND t.hora_salida < hours.h + interval '1 hour')
        + (SELECT count(*)::int FROM operational_pension_moves m
          WHERE m.proyecto_id = ${proyectoId}::uuid AND m.payload->>'tipo' LIKE 'SALIDA%' AND m.fecha >= hours.h AND m.fecha < hours.h + interval '1 hour') AS salidas
      FROM hours ORDER BY hours.h`);
  }
}
