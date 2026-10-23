import { occupancyFigures, PENSION_MAX_STAY_MS, TICKET_MAX_STAY_MS } from "@alunzadev/viggo-contracts";
import { Prisma } from "../../../generated/prisma/client";
import { countOutput, groupKey, scope, type Db, type MetricContext, type MetricOutput, type MetricQuery } from "../statistics-sql";

/**
 * Longest stay counted (docs/estadisticas.md §4.4): a ticket without exit after 7 days, or a
 * pensioner without a move after 30, is taken as gone so forgotten records do not fill a parking.
 * The same rule as OPERATIVO, from @alunzadev/viggo-contracts (ticketIsInside, pensionerIsInside).
 */
const TICKET_MAX_STAY = Prisma.sql`(${TICKET_MAX_STAY_MS} * interval '1 millisecond')`;
const PENSION_MAX_STAY = Prisma.sql`(${PENSION_MAX_STAY_MS} * interval '1 millisecond')`;

/**
 * `stays`: who was parked, as intervals [desde, hasta) of each parking in `scope`. Tickets go
 * from entry to exit; a pensioner from an entry to its next move. Uses `scope` (start_at, end_at).
 */
const stays = Prisma.sql`stays AS (
  SELECT t.proyecto_id, 'ticket' AS tipo, t.hora_inicio AS desde,
    LEAST(COALESCE(t.hora_salida, t.hora_inicio + ${TICKET_MAX_STAY}), t.hora_inicio + ${TICKET_MAX_STAY}) AS hasta
  FROM operational_tickets t JOIN scope s ON s.proyecto_id = t.proyecto_id
  WHERE t.hora_inicio >= s.start_at - ${TICKET_MAX_STAY} AND t.hora_inicio <= s.end_at
    -- A ticket marked as fraud without an exit is not a car inside.
    AND (t.hora_salida IS NOT NULL OR t.status IS DISTINCT FROM 'FRAUD')
  UNION ALL
  SELECT m.proyecto_id, 'pension', m.fecha, m.hasta FROM (
    SELECT m.proyecto_id, m.fecha, m.payload->>'tipo' AS tipo,
      LEAST(COALESCE(lead(m.fecha) OVER (PARTITION BY m.proyecto_id, m.pension_pass_id ORDER BY m.fecha), m.fecha + ${PENSION_MAX_STAY}),
        m.fecha + ${PENSION_MAX_STAY}) AS hasta
    FROM operational_pension_moves m JOIN scope s ON s.proyecto_id = m.proyecto_id
    WHERE m.fecha >= s.start_at - ${PENSION_MAX_STAY} AND m.fecha <= s.end_at
  ) m WHERE m.tipo LIKE 'ENTRADA%'
)`;

/** The parkings of the query with a valid capacity; the others have no occupancy. */
const capacities = async (ctx: MetricContext) => {
  const rows = await ctx.db.$queryRaw<Array<{ id: string; capacidad: number | null }>>(Prisma.sql`
    SELECT id::text, capacidad FROM proyectos WHERE id IN (${Prisma.join(ctx.query.proyectos.map((id) => Prisma.sql`${id}::uuid`))})`);
  return new Map(rows.filter((row) => row.capacidad !== null && row.capacidad > 0).map((row) => [row.id, row.capacidad as number]));
};

const percent = (inside: number, capacity: number) => occupancyFigures(inside, capacity).porcentaje;
const NOT_AVAILABLE: MetricOutput = { estado: "no_disponible", valor: null };

/**
 * Who is inside at `now` (the instant `start_at` of `scope`): the same rule as `stays`, read
 * only where it can hold. Open tickets of the last 7 days (an index of tickets without exit),
 * tickets whose exit is still ahead, and each pensioner whose last move of the last 30 days
 * was an entry. Reading every stay of 7 and 30 days took seconds for many parkings (#55).
 */
const insideNowStays = Prisma.sql`stays AS (
  SELECT s.proyecto_id, x.tipo FROM scope s
  CROSS JOIN LATERAL (
    SELECT 'ticket' AS tipo FROM operational_tickets t
    WHERE t.proyecto_id = s.proyecto_id AND t.hora_salida IS NULL AND t.status IS DISTINCT FROM 'FRAUD'
      AND t.hora_inicio <= s.start_at AND t.hora_inicio > s.start_at - ${TICKET_MAX_STAY}
    UNION ALL
    SELECT 'ticket' FROM operational_tickets t
    WHERE t.proyecto_id = s.proyecto_id AND t.hora_salida > s.start_at
      AND t.hora_inicio <= s.start_at AND t.hora_inicio > s.start_at - ${TICKET_MAX_STAY}
    UNION ALL
    SELECT 'pension' FROM (
      SELECT DISTINCT ON (m.pension_pass_id) m.payload->>'tipo' AS tipo
      FROM operational_pension_moves m
      WHERE m.proyecto_id = s.proyecto_id AND m.fecha <= s.start_at AND m.fecha > s.start_at - ${PENSION_MAX_STAY}
      ORDER BY m.pension_pass_id, m.fecha DESC
    ) last WHERE last.tipo LIKE 'ENTRADA%'
    -- Read per parking with its indexes, not flattened into a join over the whole table.
    OFFSET 0
  ) x
)`;

export type Inside = Array<{ proyecto_id: string; tipo: string; valor: number }>;

/**
 * Who is inside at one instant is the same for every metric asked about it: a dashboard asks
 * for the cars inside and for the occupancy with the same `now`, so the second one reuses the
 * first's answer (a few seconds at most, never across instants).
 */
const recentInside = new Map<string, { at: number; rows: Promise<Inside> }>();
const REUSE_MS = 10_000;

/**
 * Cars inside each parking at `now`, by type (ticket, pension). Also used by GET /api/ocupacion
 * (REFACTO#61), so the occupancy screen and the statistics count the same cars.
 */
export const carsInsideNow = (db: Db, proyectos: string[], now: number): Promise<Inside> => {
  if (!proyectos.length) return Promise.resolve([]);
  const key = `${now}|${[...proyectos].sort().join(",")}`;
  const reused = recentInside.get(key);
  if (reused && Date.now() - reused.at < REUSE_MS) return reused.rows;
  for (const [old, entry] of recentInside) if (Date.now() - entry.at >= REUSE_MS) recentInside.delete(old);
  const rows = db.$queryRaw<Inside>(Prisma.sql`
    WITH ${scope(proyectos, { kind: "instants", from: now, to: now })}, ${insideNowStays}
    SELECT st.proyecto_id::text, st.tipo, count(*)::int AS valor FROM stays st GROUP BY 1, 2`);
  recentInside.set(key, { at: Date.now(), rows });
  // A failed read is not reused.
  rows.catch(() => recentInside.delete(key));
  return rows;
};

export const occupancyMetrics: Record<string, MetricQuery> = {
  async "operacion.autos_dentro"(ctx) {
    const groups = new Map<string, number>();
    for (const row of await carsInsideNow(ctx.db, ctx.query.proyectos, ctx.now)) {
      const clave = ctx.query.agrupar === "proyecto" ? row.proyecto_id : ctx.query.agrupar === "tipo" ? row.tipo : "total";
      groups.set(clave, (groups.get(clave) ?? 0) + row.valor);
    }
    const rows = [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([clave, valor]) => ({ clave, valor }));
    return countOutput(rows, ctx.query.agrupar !== null);
  },

  async "operacion.ocupacion"(ctx) {
    const capacity = await capacities(ctx);
    if (!capacity.size) return NOT_AVAILABLE;
    const inside = new Map<string, number>();
    for (const row of await carsInsideNow(ctx.db, ctx.query.proyectos, ctx.now)) inside.set(row.proyecto_id, (inside.get(row.proyecto_id) ?? 0) + row.valor);
    // Consolidated: cars over spaces of the parkings that have a capacity.
    let cars = 0, spaces = 0;
    for (const [id, places] of capacity) { cars += inside.get(id) ?? 0; spaces += places; }
    return {
      estado: "ok",
      valor: percent(cars, spaces),
      ...(ctx.query.agrupar === "proyecto" ? {
        serie: [...ctx.query.proyectos].sort().map((id) => ({ clave: id, valor: capacity.has(id) ? percent(inside.get(id) ?? 0, capacity.get(id)!) : null })),
      } : {}),
    };
  },

  /**
   * Cars inside at the start of every hour of the period over the capacity, averaged. Counted
   * as running entries minus exits per hour, so it does not count every stay at every hour.
   */
  async "operacion.ocupacion_horaria"(ctx) {
    const capacity = await capacities(ctx);
    if (!capacity.size) return NOT_AVAILABLE;
    const rows = await ctx.db.$queryRaw<Array<{ clave: string; suma: number; muestras: number }>>(Prisma.sql`
      WITH ${scope([...capacity.keys()], ctx.query.rango)}, ${stays},
      samples AS (
        SELECT s.proyecto_id, s.zone, p.capacidad, k, s.start_at + k * interval '1 hour' AS at
        FROM scope s JOIN proyectos p ON p.id = s.proyecto_id
        CROSS JOIN LATERAL generate_series(0, ceil(extract(epoch FROM s.end_at - s.start_at) / 3600)::int - 1) AS k
      ),
      -- A stay is inside at the samples k with desde <= at < hasta: +1 at its first, -1 after its last.
      deltas AS (
        SELECT st.proyecto_id, GREATEST(0, ceil(extract(epoch FROM st.desde - s.start_at) / 3600))::int AS k, 1 AS d
        FROM stays st JOIN scope s ON s.proyecto_id = st.proyecto_id
        UNION ALL
        SELECT st.proyecto_id, GREATEST(0, ceil(extract(epoch FROM st.hasta - s.start_at) / 3600))::int, -1
        FROM stays st JOIN scope s ON s.proyecto_id = st.proyecto_id
      ),
      per_hour AS (SELECT proyecto_id, k, sum(d) AS d FROM deltas GROUP BY 1, 2),
      occupancy AS (
        SELECT sa.proyecto_id, sa.zone, sa.at, sa.capacidad,
          sum(COALESCE(ph.d, 0)) OVER (PARTITION BY sa.proyecto_id ORDER BY sa.k) AS dentro
        FROM samples sa LEFT JOIN per_hour ph ON ph.proyecto_id = sa.proyecto_id AND ph.k = sa.k
      )
      SELECT ${groupKey(ctx.query.agrupar, Prisma.sql`s.at`)} AS clave,
        sum(s.dentro * 100.0 / s.capacidad)::float8 AS suma, count(*)::int AS muestras
      FROM occupancy s GROUP BY 1 ORDER BY 1`);
    const total = rows.reduce((sum, row) => sum + row.suma, 0), samples = rows.reduce((sum, row) => sum + row.muestras, 0);
    if (!samples) return { estado: "sin_datos", valor: null };
    const average = (sum: number, count: number) => Math.round((sum / count) * 10) / 10;
    return {
      estado: "ok",
      valor: average(total, samples),
      ...(ctx.query.agrupar !== null ? { serie: rows.map((row) => ({ clave: row.clave, valor: average(row.suma, row.muestras) })) } : {}),
    };
  },
};
