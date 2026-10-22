import { Prisma } from "../../generated/prisma/client";
import type { Dimension } from "../../domain/statistics/catalog";
import type { MetricResult, StatisticsQuery, StatisticsRange } from "../../domain/statistics/statistics";

export type Db = Prisma.TransactionClient;
export type MetricOutput = Pick<MetricResult, "estado" | "valor" | "moneda" | "serie">;
export interface MetricContext {
  db: Db;
  query: StatisticsQuery;
  now: number;
}
/** One metric: its SQL, aggregated in the database. */
export type MetricQuery = (ctx: MetricContext) => Promise<MetricOutput>;

/**
 * `scope`: the requested parkings with their range as instants. Local dates are converted in
 * each parking's own time zone ("del 1 al 15" in Tijuana ends two hours after Mexico City).
 */
export const scope = (proyectos: string[], range: StatisticsRange) => {
  const start = range.kind === "dates"
    ? Prisma.sql`(${range.desde}::date)::timestamp AT TIME ZONE p.zona_horaria`
    : Prisma.sql`${new Date(range.from)}::timestamptz`;
  const end = range.kind === "dates"
    ? Prisma.sql`(${range.hasta}::date + 1)::timestamp AT TIME ZONE p.zona_horaria`
    : Prisma.sql`${new Date(range.to)}::timestamptz`;
  return Prisma.sql`scope AS (
    SELECT p.id AS proyecto_id, p.zona_horaria AS zone, ${start} AS start_at, ${end} AS end_at
    FROM proyectos p WHERE p.id IN (${Prisma.join(proyectos.map((id) => Prisma.sql`${id}::uuid`))})
  )`;
};

/**
 * `scope` split for the totals (docs/estadisticas-carga.md §5):
 * - `parts`: per parking, the whole past hours [a, b) of its range. Of them, the whole local
 *   days [day_a, day_b), from ds to de, are read from statistics_daily_* (#56) and the hours
 *   left at both ends from statistics_hourly_*. Without daily totals (by default when grouping
 *   by hour, whose hour of day a day total loses) ds = de = b and everything comes from the hours;
 * - `windows`: what is left (the range's first and last partial hours, and the hour in
 *   course), at most about two hours per parking, computed live from the source tables.
 */
export const hourlyScope = (query: StatisticsQuery, now: number, options: { daily?: boolean } = {}) => {
  const daily = options.daily ?? query.agrupar !== "hora";
  return Prisma.sql`
  ${scope(query.proyectos, query.rango)},
  hours AS (
    SELECT s.proyecto_id, s.zone, s.start_at, s.end_at, x.a,
      GREATEST(x.a, LEAST(date_trunc('hour', s.end_at, 'UTC'), date_trunc('hour', ${new Date(now)}::timestamptz, 'UTC'))) AS b
    FROM scope s CROSS JOIN LATERAL (SELECT date_trunc('hour', s.start_at - interval '1 millisecond', 'UTC') + interval '1 hour' AS a) x
  ),
  parts AS (
    SELECT h.*, d.day_a, d.day_b,
      CASE WHEN ${daily} AND d.day_b > d.day_a THEN d.day_a::timestamp AT TIME ZONE h.zone ELSE h.b END AS ds,
      CASE WHEN ${daily} AND d.day_b > d.day_a THEN d.day_b::timestamp AT TIME ZONE h.zone ELSE h.b END AS de
    FROM hours h CROSS JOIN LATERAL (
      -- The first local midnight at or after a, and the last one at or before b.
      SELECT CASE WHEN ((h.a AT TIME ZONE h.zone)::date)::timestamp AT TIME ZONE h.zone < h.a
          THEN (h.a AT TIME ZONE h.zone)::date + 1 ELSE (h.a AT TIME ZONE h.zone)::date END AS day_a,
        (h.b AT TIME ZONE h.zone)::date AS day_b
    ) d
  ),
  windows AS (
    SELECT proyecto_id, start_at AS w_start, LEAST(a, end_at) AS w_end FROM parts WHERE start_at < LEAST(a, end_at)
    UNION ALL
    SELECT proyecto_id, GREATEST(b, start_at), end_at FROM parts WHERE end_at > GREATEST(b, start_at)
  )`;
};

/**
 * Rows of a totals table for `parts` (alias p): the hours left at both ends from the hourly
 * table and the whole days from the daily one, each read per parking with its index (OFFSET 0
 * keeps PostgreSQL from flattening them into a scan of the whole table). `select(table, ts)`
 * gives the columns, with `ts` the instant the row stands for.
 */
export const fromTotals = (hourly: string, daily: string, select: (t: Prisma.Sql, ts: Prisma.Sql) => Prisma.Sql) => Prisma.sql`
  SELECT * FROM parts p CROSS JOIN LATERAL (
    ${select(Prisma.sql`h`, Prisma.sql`h.hora`)} FROM ${Prisma.raw(hourly)} h
    WHERE h.proyecto_id = p.proyecto_id AND h.hora >= p.a AND h.hora < p.ds
    UNION ALL
    ${select(Prisma.sql`h`, Prisma.sql`h.hora`)} FROM ${Prisma.raw(hourly)} h
    WHERE h.proyecto_id = p.proyecto_id AND h.hora >= p.de AND h.hora < p.b
    UNION ALL
    ${select(Prisma.sql`d`, Prisma.sql`(d.dia::timestamp AT TIME ZONE p.zone)`)} FROM ${Prisma.raw(daily)} d
    WHERE p.ds < p.de AND d.proyecto_id = p.proyecto_id AND d.dia >= p.day_a AND d.dia < p.day_b
    OFFSET 0
  ) t`;

/** The grouping key of a row: its local day or hour, its parking, or a metric's own column. */
export const groupKey = (dimension: Dimension | null, time: Prisma.Sql, own: Partial<Record<Dimension, Prisma.Sql>> = {}) => {
  switch (dimension) {
    case null: return Prisma.sql`'total'`;
    case "dia": return Prisma.sql`((${time} AT TIME ZONE s.zone)::date)::text`;
    case "hora": return Prisma.sql`to_char(${time} AT TIME ZONE s.zone, 'HH24') || ':00'`;
    case "proyecto": return Prisma.sql`s.proyecto_id::text`;
    default: return own[dimension] ?? Prisma.sql`'total'`;
  }
};

/** `time` inside the parking's range. */
export const inRange = (time: Prisma.Sql) => Prisma.sql`${time} >= s.start_at AND ${time} < s.end_at`;

/** Money without float drift: decimal text -> cents and back. */
const toCents = (value: string) => {
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = value.replace("-", "").split(".");
  const cents = BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
  return negative ? -cents : cents;
};
const fromCents = (cents: bigint) => {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  return `${negative ? "-" : ""}${abs / 100n}.${String(abs % 100n).padStart(2, "0")}`;
};
export const addMoney = (values: string[]) => fromCents(values.reduce((sum, value) => sum + toCents(value), 0n));

/** Rows (clave, valor) as a money metric: the total, and the series when grouped. */
export const moneyOutput = (rows: Array<{ clave: string; valor: string }>, grouped: boolean): MetricOutput => ({
  estado: "ok",
  valor: addMoney(rows.map((row) => row.valor)),
  moneda: "MXN",
  ...(grouped ? { serie: rows.map((row) => ({ clave: row.clave, valor: row.valor })) } : {}),
});

/** Rows (clave, valor) as a count metric. */
export const countOutput = (rows: Array<{ clave: string; valor: number }>, grouped: boolean): MetricOutput => ({
  estado: "ok",
  valor: rows.reduce((sum, row) => sum + Number(row.valor), 0),
  ...(grouped ? { serie: rows.map((row) => ({ clave: row.clave, valor: Number(row.valor) })) } : {}),
});
