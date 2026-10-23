import { PostgresDatabase } from "../../../data/postgres";
import { Prisma } from "../../../generated/prisma/client";
import {
  HeartbeatOverviewDatasource,
  type ProjectHeartbeatRow,
} from "../../../domain/datasources/heartbeat/heartbeat-overview.datasource";
import { isUuid } from "../postgres/prisma-errors";

type Row = {
  proyecto_id: string;
  nombre: string;
  identificador: string;
  ciudad: string;
  coordinates: unknown;
  installation_id: string | null;
  last_seen_at: Date | null;
  snapshot_received_at: Date | null;
  total: number;
  online: number;
  offline: number;
  last_heartbeat_at: Date | null;
};

export class HeartbeatOverviewPostgresDatasource extends HeartbeatOverviewDatasource {
  private get db() {
    return PostgresDatabase.client;
  }

  async listProjects(projectIds: string[] | null): Promise<ProjectHeartbeatRow[]> {
    const ids = projectIds?.filter(isUuid) ?? null;
    if (ids && ids.length === 0) return [];
    const scope = ids ? Prisma.sql`AND p.id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})` : Prisma.empty;
    // One query for every parking: per-parking lookups stay inside LATERAL subqueries.
    const rows = await this.db.$queryRaw<Row[]>(Prisma.sql`
      SELECT p.id::text AS proyecto_id, p.nombre, p.identificador, p.ciudad, p.coordinates,
        i.installation_id, i.last_command_poll_at AS last_seen_at,
        s.received_at AS snapshot_received_at,
        m.total, m.online, m.offline, m.last_heartbeat_at
      FROM proyectos p
      LEFT JOIN LATERAL (
        SELECT li.installation_id, li.last_command_poll_at FROM local_installations li
        WHERE li.proyecto_id = p.id AND li.status = 'approved'
        ORDER BY li.last_command_poll_at DESC NULLS LAST LIMIT 1
      ) i ON true
      LEFT JOIN project_heartbeat_snapshots s ON s.proyecto_id = p.id
      CROSS JOIN LATERAL (
        SELECT count(*)::int AS total,
          count(*) FILTER (WHERE d.heartbeat_status = 'online')::int AS online,
          count(*) FILTER (WHERE d.heartbeat_status = 'offline')::int AS offline,
          max(d.last_heartbeat_at) AS last_heartbeat_at
        FROM modulos mo LEFT JOIN modulo_device_states d ON d.modulo_id = mo.id
        WHERE mo.proyecto_id = p.id AND mo.estado
      ) m
      WHERE p.estado ${scope}
      ORDER BY p.nombre, p.id`);
    return rows.map((row) => ({
      proyectoId: row.proyecto_id,
      nombre: row.nombre,
      identificador: row.identificador,
      ciudad: row.ciudad,
      coordinates: row.coordinates,
      installationId: row.installation_id,
      lastSeenAt: row.last_seen_at?.getTime() ?? null,
      snapshotReceivedAt: row.snapshot_received_at?.getTime() ?? null,
      modules: { total: row.total, online: row.online, offline: row.offline, pending: row.total - row.online - row.offline },
      lastHeartbeatAt: row.last_heartbeat_at?.getTime() ?? null,
    }));
  }
}
