import { Prisma } from "../../../generated/prisma/client";
import { BUCKET_COUNT, STAY_RANGES, rangeIncome, stayBucket, ticketEntryRows, ticketExitRows } from "../hourly-sql";
import { countOutput, fromTotals, groupKey, hourlyScope, type MetricContext, type MetricQuery } from "../statistics-sql";

// Tickets come from OPERATIVO's copy (docs/estadisticas.md §2): whole past hours from
// statistics_hourly_tickets, the rest of the range live with the same rules.

/** The totals of each parking's whole past hours. */
/** Ticket totals of the range's whole days and past hours, with the columns `select` names. */
const totals = (select: (t: Prisma.Sql) => Prisma.Sql) =>
  fromTotals("statistics_hourly_tickets", "statistics_daily_tickets", (t, ts) => Prisma.sql`SELECT ${ts} AS ts, ${select(t)}`);

const count = async (ctx: MetricContext, column: "entradas" | "salidas") => {
  // By hour, a day row is spread over its local hours (its per-hour array): each one at that
  // hour of the day, so the grouping key reads it as that hour.
  const byHour = ctx.query.agrupar === "hora";
  const dayRows = Prisma.sql`
    SELECT p.proyecto_id, (d.dia + make_interval(hours => h.hora))::timestamp AT TIME ZONE p.zone AS ts, d.${Prisma.raw(column)}_hora[h.hora + 1] AS n
    FROM parts p JOIN statistics_daily_tickets d ON p.ds < p.de AND d.proyecto_id = p.proyecto_id AND d.dia >= p.day_a AND d.dia < p.day_b
    CROSS JOIN generate_series(0, 23) AS h(hora)`;
  const rows = await ctx.db.$queryRaw<Array<{ clave: string; valor: number }>>(Prisma.sql`
    WITH ${hourlyScope(ctx.query, ctx.now, { daily: true })},
    tickets AS (
      ${byHour
        ? Prisma.sql`SELECT x.proyecto_id, x.ts, x.n FROM (${totals((t) => Prisma.sql`${t}.${Prisma.raw(column)} AS n`)}) x
          WHERE x.n > 0 AND NOT (x.ts >= x.ds AND x.ts < x.de)
          UNION ALL SELECT proyecto_id, ts, n FROM (${dayRows}) days WHERE n > 0`
        : Prisma.sql`SELECT x.proyecto_id, x.ts, x.n FROM (${totals((t) => Prisma.sql`${t}.${Prisma.raw(column)} AS n`)}) x WHERE x.n > 0`}
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
        SELECT x.proyecto_id, x.ts, x.n, x.monto FROM (${totals((t) => Prisma.sql`${t}.pagados AS n, ${t}.monto_pagado AS monto`)}) x WHERE x.n > 0
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
        SELECT x.proyecto_id, x.ts, x.n, x.minutos, x.buckets, x.bucket_minutos, x.ingresos
        FROM (${totals((t) => Prisma.sql`${t}.estancias AS n, ${t}.estancia_minutos AS minutos, ${t}.estancia_buckets AS buckets,
          ${t}.estancia_bucket_minutos AS bucket_minutos, ${t}.estancia_ingresos AS ingresos`)}) x WHERE x.n > 0
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
