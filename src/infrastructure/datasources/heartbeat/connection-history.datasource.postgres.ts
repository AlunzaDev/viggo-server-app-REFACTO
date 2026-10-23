import { PostgresDatabase } from "../../../data/postgres";
import { Prisma } from "../../../generated/prisma/client";
import {
  ConnectionHistoryDatasource,
  type ConnectionDowntime,
  type ConnectionEventRecord,
  type ConnectionHistoryFilters,
  type ConnectionStatus,
  type InstallationChangeInput,
} from "../../../domain/datasources/heartbeat/connection-history.datasource";
import { isUuid } from "../postgres/prisma-errors";

const uuidList = (ids: string[]) => Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`));

/** The filters as a WHERE on `connection_events e`; null when they can match nothing. */
const where = (filters: ConnectionHistoryFilters, fromBeginning = false) => {
  const projectIds = filters.projectIds?.filter(isUuid) ?? null;
  if (projectIds && !projectIds.length) return null;
  if ((filters.proyectoId && !isUuid(filters.proyectoId)) || (filters.moduloId && !isUuid(filters.moduloId))) return null;
  const parts = [
    Prisma.sql`e.occurred_at < ${new Date(filters.hasta)}`,
    // The downtime also needs the state each one was in when the period started.
    ...(fromBeginning ? [] : [Prisma.sql`e.occurred_at >= ${new Date(filters.desde)}`]),
    ...(projectIds ? [Prisma.sql`e.proyecto_id IN (${uuidList(projectIds)})`] : []),
    ...(filters.proyectoId ? [Prisma.sql`e.proyecto_id = ${filters.proyectoId}::uuid`] : []),
    ...(filters.moduloId ? [Prisma.sql`e.modulo_id = ${filters.moduloId}::uuid`] : []),
    ...(filters.sujeto === "instalacion" ? [Prisma.sql`e.modulo_id IS NULL`] : []),
    ...(filters.sujeto === "modulo" ? [Prisma.sql`e.modulo_id IS NOT NULL`] : []),
  ];
  return Prisma.join(parts, " AND ");
};

type EventRow = {
  id: string; proyecto_id: string; proyecto_nombre: string; installation_id: string;
  modulo_id: string | null; modulo_nombre: string | null; modulo_identificador: string | null;
  from_status: ConnectionStatus; to_status: ConnectionStatus; occurred_at: Date;
};

type DowntimeRow = {
  proyecto_id: string; proyecto_nombre: string; modulo_id: string | null; modulo_nombre: string | null;
  modulo_identificador: string | null; caidas: number; segundos: number | null;
};

export class ConnectionHistoryPostgresDatasource extends ConnectionHistoryDatasource {
  private get db() {
    return PostgresDatabase.client;
  }

  async recordInstallationChange(input: InstallationChangeInput) {
    if (!isUuid(input.proyectoId)) return;
    await this.db.connectionEvent.create({ data: {
      proyectoId: input.proyectoId, installationId: input.installationId, moduloId: null,
      fromStatus: input.fromStatus, toStatus: input.toStatus, occurredAt: new Date(input.occurredAt),
    } });
  }

  async list(filters: ConnectionHistoryFilters, { page, limit }: { page: number; limit: number }) {
    const condition = where(filters);
    if (!condition) return { total: 0, events: [] };
    const [count, rows] = await Promise.all([
      this.db.$queryRaw<Array<{ total: number }>>(Prisma.sql`SELECT count(*)::int AS total FROM connection_events e WHERE ${condition}`),
      this.db.$queryRaw<EventRow[]>(Prisma.sql`
        SELECT e.id::text, e.proyecto_id::text, p.nombre AS proyecto_nombre, e.installation_id,
          e.modulo_id::text, m.nombre AS modulo_nombre, m.identificador AS modulo_identificador,
          e.from_status, e.to_status, e.occurred_at
        FROM connection_events e
        JOIN proyectos p ON p.id = e.proyecto_id
        LEFT JOIN modulos m ON m.id = e.modulo_id
        WHERE ${condition}
        ORDER BY e.occurred_at DESC, e.id DESC
        LIMIT ${limit} OFFSET ${(page - 1) * limit}`),
    ]);
    const events: ConnectionEventRecord[] = rows.map((row) => ({
      id: row.id,
      proyectoId: row.proyecto_id,
      proyectoNombre: row.proyecto_nombre,
      installationId: row.installation_id,
      moduloId: row.modulo_id,
      moduloNombre: row.modulo_nombre,
      moduloIdentificador: row.modulo_identificador,
      fromStatus: row.from_status,
      toStatus: row.to_status,
      occurredAt: row.occurred_at.getTime(),
    }));
    return { total: count[0]?.total ?? 0, events };
  }

  async downtime(filters: ConnectionHistoryFilters, until: number): Promise<ConnectionDowntime[]> {
    const condition = where(filters, true);
    if (!condition) return [];
    const from = new Date(filters.desde);
    const end = new Date(Math.min(until, filters.hasta));
    // Each offline stretch lasts until the next event of the same installation or module (or
    // until `end`), clipped to the period: one that began before the period counts from its start.
    const rows = await this.db.$queryRaw<DowntimeRow[]>(Prisma.sql`
      WITH ev AS (
        SELECT e.proyecto_id, e.modulo_id, e.to_status, e.occurred_at,
          lead(e.occurred_at) OVER (PARTITION BY e.proyecto_id, e.modulo_id ORDER BY e.occurred_at, e.id) AS next_at
        FROM connection_events e WHERE ${condition}
      ), totals AS (
        SELECT proyecto_id, modulo_id,
          (count(*) FILTER (WHERE to_status = 'offline' AND occurred_at >= ${from}))::int AS caidas,
          sum(EXTRACT(EPOCH FROM LEAST(COALESCE(next_at, ${end}), ${end}) - GREATEST(occurred_at, ${from})))
            FILTER (WHERE to_status = 'offline' AND COALESCE(next_at, ${end}) > ${from} AND occurred_at < ${end}) AS segundos
        FROM ev GROUP BY proyecto_id, modulo_id
      )
      SELECT t.proyecto_id::text, p.nombre AS proyecto_nombre, t.modulo_id::text, m.nombre AS modulo_nombre,
        m.identificador AS modulo_identificador, t.caidas, t.segundos::float8 AS segundos
      FROM totals t
      JOIN proyectos p ON p.id = t.proyecto_id
      LEFT JOIN modulos m ON m.id = t.modulo_id
      WHERE t.caidas > 0 OR t.segundos > 0
      ORDER BY t.segundos DESC NULLS LAST, t.caidas DESC, p.nombre, m.nombre`);
    return rows.map((row) => ({
      proyectoId: row.proyecto_id,
      proyectoNombre: row.proyecto_nombre,
      moduloId: row.modulo_id,
      moduloNombre: row.modulo_nombre,
      moduloIdentificador: row.modulo_identificador,
      caidas: row.caidas,
      minutosSinConexion: Math.round(Math.max(0, row.segundos ?? 0) / 60),
    }));
  }
}
