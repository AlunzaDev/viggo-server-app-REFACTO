import { Prisma } from "../../../generated/prisma/client";
import { countOutput, groupKey, inRange, scope, type MetricContext, type MetricQuery } from "../statistics-sql";

// Tickets come from OPERATIVO's copy, through the typed columns (docs/estadisticas.md §2).
const count = async (ctx: MetricContext, time: Prisma.Sql) => {
  const rows = await ctx.db.$queryRaw<Array<{ clave: string; valor: number }>>(Prisma.sql`
    WITH ${scope(ctx.query.proyectos, ctx.query.rango)}
    SELECT ${groupKey(ctx.query.agrupar, time)} AS clave, count(*)::int AS valor
    FROM operational_tickets ot JOIN scope s ON s.proyecto_id = ot.proyecto_id
    WHERE ${inRange(time)} GROUP BY 1 ORDER BY 1`);
  return countOutput(rows, ctx.query.agrupar !== null);
};

/** Stay ranges shown by the dashboard. */
const RANGES = [
  { rango: "< 1 Hora", desde: 0, hasta: 60 },
  { rango: "1 - 3 Horas", desde: 60, hasta: 180 },
  { rango: "3 - 8 Horas", desde: 180, hasta: 480 },
  { rango: "8+ Horas", desde: 480, hasta: null },
] as const;

export const ticketMetrics: Record<string, MetricQuery> = {
  "tickets.entradas": (ctx) => count(ctx, Prisma.sql`ot.hora_inicio`),
  "tickets.salidas": (ctx) => count(ctx, Prisma.sql`ot.hora_salida`),

  async "tickets.ticket_promedio"(ctx) {
    const rows = await ctx.db.$queryRaw<Array<{ clave: string; valor: string; tickets: number }>>(Prisma.sql`
      WITH ${scope(ctx.query.proyectos, ctx.query.rango)}
      SELECT ${groupKey(ctx.query.agrupar, Prisma.sql`ot.hora_salida`)} AS clave,
        round(avg(ot.monto), 2)::text AS valor, count(*)::int AS tickets
      FROM operational_tickets ot JOIN scope s ON s.proyecto_id = ot.proyecto_id
      WHERE ot.pagado AND ot.monto IS NOT NULL AND ${inRange(Prisma.sql`ot.hora_salida`)}
      GROUP BY 1 ORDER BY 1`);
    if (!rows.length) return { estado: "sin_datos", valor: null, moneda: "MXN" };
    // The overall average weighs each group by its tickets, not each group equally.
    const total = rows.reduce((sum, row) => sum + Number(row.valor) * row.tickets, 0) / rows.reduce((sum, row) => sum + row.tickets, 0);
    return {
      estado: "ok", valor: total.toFixed(2), moneda: "MXN",
      ...(ctx.query.agrupar ? { serie: rows.map((row) => ({ clave: row.clave, valor: row.valor })) } : {}),
    };
  },

  async "tickets.estancia"(ctx) {
    const rows = await ctx.db.$queryRaw<Array<{ clave: string; tickets: number; promedio: number; mediana: number; rangos: Array<{ tickets: number; ingresos: string }> }>>(Prisma.sql`
      WITH ${scope(ctx.query.proyectos, ctx.query.rango)},
      stays AS (
        SELECT ${groupKey(ctx.query.agrupar, Prisma.sql`ot.hora_salida`)} AS clave,
          extract(epoch FROM ot.hora_salida - ot.hora_inicio) / 60 AS minutos,
          CASE WHEN ot.pagado THEN coalesce(ot.monto, 0) ELSE 0 END AS ingreso
        FROM operational_tickets ot JOIN scope s ON s.proyecto_id = ot.proyecto_id
        WHERE ot.hora_inicio IS NOT NULL AND ot.hora_salida >= ot.hora_inicio AND ${inRange(Prisma.sql`ot.hora_salida`)}
      )
      SELECT clave, count(*)::int AS tickets, round(avg(minutos))::float8 AS promedio,
        round(percentile_cont(0.5) WITHIN GROUP (ORDER BY minutos))::float8 AS mediana,
        json_build_array(${Prisma.join(RANGES.map((range) => Prisma.sql`json_build_object(
          'tickets', count(*) FILTER (WHERE minutos >= ${range.desde} ${range.hasta === null ? Prisma.empty : Prisma.sql`AND minutos < ${range.hasta}`}),
          'ingresos', coalesce(sum(ingreso) FILTER (WHERE minutos >= ${range.desde} ${range.hasta === null ? Prisma.empty : Prisma.sql`AND minutos < ${range.hasta}`}), 0)::numeric(14, 2)::text)`))}) AS rangos
      FROM stays GROUP BY clave ORDER BY clave`);
    if (!rows.length) return { estado: "sin_datos", valor: null };
    const shape = (row: (typeof rows)[number]) => ({
      tickets: row.tickets, promedioMinutos: row.promedio, medianaMinutos: row.mediana,
      rangos: RANGES.map((range, index) => ({ rango: range.rango, tickets: row.rangos[index].tickets, ingresos: row.rangos[index].ingresos })),
    });
    if (!ctx.query.agrupar) return { estado: "ok", valor: shape(rows[0]) };
    // Grouped: each group's stays; the overall figures are asked without grouping.
    return { estado: "ok", valor: null, serie: rows.map((row) => ({ clave: row.clave, valor: shape(row) })) };
  },
};
