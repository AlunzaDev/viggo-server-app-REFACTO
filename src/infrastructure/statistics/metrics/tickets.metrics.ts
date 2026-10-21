import { Prisma } from "../../../generated/prisma/client";
import { BUCKET_COUNT, STAY_RANGES, rangeIncome, stayBucket, ticketEntryRows, ticketExitRows } from "../hourly-sql";
import { countOutput, groupKey, hourlyScope, type MetricContext, type MetricQuery } from "../statistics-sql";

// Tickets come from OPERATIVO's copy (docs/estadisticas.md §2): whole past hours from
// statistics_hourly_tickets, the rest of the range live with the same rules.

/** The totals of each parking's whole past hours. */
const fromTotals = Prisma.sql`parts p JOIN statistics_hourly_tickets h ON h.proyecto_id = p.proyecto_id AND h.hora >= p.a AND h.hora < p.b`;

const count = async (ctx: MetricContext, column: "entradas" | "salidas") => {
  const rows = await ctx.db.$queryRaw<Array<{ clave: string; valor: number }>>(Prisma.sql`
    WITH ${hourlyScope(ctx.query, ctx.now)},
    tickets AS (
      SELECT h.proyecto_id, h.hora AS ts, h.${Prisma.raw(column)} AS n FROM ${fromTotals} WHERE h.${Prisma.raw(column)} > 0
      UNION ALL
      SELECT proyecto_id, ts, 1 FROM (${column === "entradas" ? ticketEntryRows : ticketExitRows}) live
    ),
    -- Per parking and hour first: the grouping key is then computed once per hour.
    hourly AS (SELECT proyecto_id, date_trunc('hour', ts, 'UTC') AS ts, sum(n) AS n FROM tickets GROUP BY 1, 2)
    SELECT ${groupKey(ctx.query.agrupar, Prisma.sql`t.ts`)} AS clave, sum(t.n)::int AS valor
    FROM hourly t JOIN scope s ON s.proyecto_id = t.proyecto_id GROUP BY 1 ORDER BY 1`);
  return countOutput(rows, ctx.query.agrupar !== null);
};

/**
 * The median from the stay histogram (docs/estadisticas-carga.md §5): the average of the stays
 * of the bucket where the middle stay falls. Exact with few stays, within the bucket (15 min
 * where most stays are) with many.
 */
const medianFromBuckets = (buckets: number[], minutes: number[]) => {
  const target = buckets.reduce((sum, value) => sum + value, 0) / 2;
  let before = 0;
  for (let index = 0; index < buckets.length; index += 1) {
    before += buckets[index];
    if (buckets[index] > 0 && before >= target) return Math.round(minutes[index] / buckets[index]);
  }
  return 0;
};

export const ticketMetrics: Record<string, MetricQuery> = {
  "tickets.entradas": (ctx) => count(ctx, "entradas"),
  "tickets.salidas": (ctx) => count(ctx, "salidas"),

  async "tickets.ticket_promedio"(ctx) {
    const rows = await ctx.db.$queryRaw<Array<{ clave: string; monto: string; tickets: number }>>(Prisma.sql`
      WITH ${hourlyScope(ctx.query, ctx.now)},
      paid AS (
        SELECT h.proyecto_id, h.hora AS ts, h.pagados AS n, h.monto_pagado AS monto FROM ${fromTotals} WHERE h.pagados > 0
        UNION ALL
        SELECT proyecto_id, ts, 1, monto FROM (${ticketExitRows}) live WHERE pagado
      )
      SELECT ${groupKey(ctx.query.agrupar, Prisma.sql`t.ts`)} AS clave, sum(t.monto)::text AS monto, sum(t.n)::int AS tickets
      FROM paid t JOIN scope s ON s.proyecto_id = t.proyecto_id GROUP BY 1 ORDER BY 1`);
    if (!rows.length) return { estado: "sin_datos", valor: null, moneda: "MXN" };
    // The overall average weighs each group by its tickets, not each group equally.
    const total = rows.reduce((sum, row) => sum + Number(row.monto), 0) / rows.reduce((sum, row) => sum + row.tickets, 0);
    return {
      estado: "ok", valor: total.toFixed(2), moneda: "MXN",
      ...(ctx.query.agrupar ? { serie: rows.map((row) => ({ clave: row.clave, valor: (Number(row.monto) / row.tickets).toFixed(2) })) } : {}),
    };
  },

  async "tickets.estancia"(ctx) {
    const bucketIndexes = Array.from({ length: BUCKET_COUNT }, (_, index) => index + 1);
    const rows = await ctx.db.$queryRaw<Array<{ clave: string; tickets: number; minutos: number; buckets: number[]; bucket_minutos: number[]; ingresos: string[] }>>(Prisma.sql`
      WITH ${hourlyScope(ctx.query, ctx.now)},
      stays AS (
        SELECT h.proyecto_id, h.hora AS ts, h.estancias AS n, h.estancia_minutos AS minutos, h.estancia_buckets AS buckets, h.estancia_bucket_minutos AS bucket_minutos, h.estancia_ingresos AS ingresos
        FROM ${fromTotals} WHERE h.estancias > 0
        UNION ALL
        SELECT proyecto_id, ts, 1, minutos,
          ARRAY[${Prisma.join(bucketIndexes.map((index) => Prisma.sql`(${stayBucket(Prisma.sql`minutos`)} = ${index})::int`))}],
          ARRAY[${Prisma.join(bucketIndexes.map((index) => Prisma.sql`CASE WHEN ${stayBucket(Prisma.sql`minutos`)} = ${index} THEN minutos ELSE 0 END::float8`))}],
          ${rangeIncome((value) => Prisma.sql`(${value})::numeric(14, 2)`)}
        FROM (${ticketExitRows}) live WHERE minutos IS NOT NULL
      )
      SELECT ${groupKey(ctx.query.agrupar, Prisma.sql`t.ts`)} AS clave, sum(t.n)::int AS tickets, sum(t.minutos)::float8 AS minutos,
        ARRAY[${Prisma.join(bucketIndexes.map((index) => Prisma.sql`sum(t.buckets[${index}])::int`))}] AS buckets,
        ARRAY[${Prisma.join(bucketIndexes.map((index) => Prisma.sql`sum(t.bucket_minutos[${index}])::float8`))}] AS bucket_minutos,
        ARRAY[${Prisma.join(STAY_RANGES.map((_, index) => Prisma.sql`sum(t.ingresos[${index + 1}])::numeric(14, 2)::text`))}] AS ingresos
      FROM stays t JOIN scope s ON s.proyecto_id = t.proyecto_id GROUP BY 1 ORDER BY 1`);
    if (!rows.length) return { estado: "sin_datos", valor: null };
    const shape = (row: (typeof rows)[number]) => ({
      tickets: row.tickets,
      promedioMinutos: Math.round(row.minutos / row.tickets),
      medianaMinutos: medianFromBuckets(row.buckets, row.bucket_minutos),
      rangos: STAY_RANGES.map((range, index) => ({
        rango: range.rango,
        tickets: row.buckets.slice(range.buckets[0] - 1, range.buckets[1]).reduce((sum, value) => sum + value, 0),
        ingresos: row.ingresos[index],
      })),
    });
    if (!ctx.query.agrupar) return { estado: "ok", valor: shape(rows[0]) };
    // Grouped: each group's stays; the overall figures are asked without grouping.
    return { estado: "ok", valor: null, serie: rows.map((row) => ({ clave: row.clave, valor: shape(row) })) };
  },
};
