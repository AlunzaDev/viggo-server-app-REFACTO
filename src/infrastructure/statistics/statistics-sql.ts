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
 * `scope` split for the hourly totals (docs/estadisticas-carga.md §5):
 * - `parts`: per parking, the whole past hours [a, b) of its range, read from statistics_hourly_*;
 * - `windows`: what is left (the range's first and last partial hours, and the hour in
 *   course), at most about two hours per parking, computed live from the source tables.
 */
export const hourlyScope = (query: StatisticsQuery, now: number) => Prisma.sql`
  ${scope(query.proyectos, query.rango)},
  parts AS (
    SELECT s.proyecto_id, s.start_at, s.end_at, x.a,
      GREATEST(x.a, LEAST(date_trunc('hour', s.end_at, 'UTC'), date_trunc('hour', ${new Date(now)}::timestamptz, 'UTC'))) AS b
    FROM scope s CROSS JOIN LATERAL (SELECT date_trunc('hour', s.start_at - interval '1 millisecond', 'UTC') + interval '1 hour' AS a) x
  ),
  windows AS (
    SELECT proyecto_id, start_at AS w_start, LEAST(a, end_at) AS w_end FROM parts WHERE start_at < LEAST(a, end_at)
    UNION ALL
    SELECT proyecto_id, GREATEST(b, start_at), end_at FROM parts WHERE end_at > GREATEST(b, start_at)
  )`;

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
