import { Prisma } from "../../../generated/prisma/client";
import { paymentRows } from "../hourly-sql";
import { groupKey, hourlyScope, moneyOutput, type MetricContext, type MetricQuery } from "../statistics-sql";

/**
 * Money of one real charge each (docs/estadisticas.md §4.1): charges at their payment date
 * and refunds at the date they were made (§4.3), in MXN. Whole past hours come from
 * statistics_hourly_payments; the rest of the range is read live with the same rules.
 */
const sum = async (ctx: MetricContext, amount: Prisma.Sql, filter: Prisma.Sql) => {
  // Method and type are kept per hour only when they are the grouping.
  const own = ctx.query.agrupar === "metodo" ? "metodo" : ctx.query.agrupar === "tipo" ? "tipo" : null;
  const ownColumns = own ? Prisma.sql`m.${Prisma.raw(own)}` : Prisma.sql`NULL::text AS metodo, NULL::text AS tipo`;
  const ownGroup = own ? Prisma.sql`, 3` : Prisma.empty;
  const rows = await ctx.db.$queryRaw<Array<{ clave: string; valor: string }>>(Prisma.sql`
    WITH ${hourlyScope(ctx.query, ctx.now)},
    movements AS (
      SELECT h.proyecto_id, h.hora AS ts, h.movimiento, NULLIF(h.metodo, '') AS metodo, NULLIF(h.tipo, '') AS tipo, h.monto
      FROM parts p JOIN statistics_hourly_payments h ON h.proyecto_id = p.proyecto_id AND h.hora >= p.a AND h.hora < p.b
      UNION ALL
      SELECT proyecto_id, ts, movimiento, metodo, tipo, monto FROM (${paymentRows}) live
    ),
    -- Summed per parking and hour first: the grouping key (local day, hour) is then computed
    -- once per hour, not once per row.
    hourly AS (
      SELECT m.proyecto_id, date_trunc('hour', m.ts, 'UTC') AS ts, ${ownColumns}, sum(${amount}) AS monto
      FROM movements m WHERE ${filter}
      GROUP BY 1, 2${ownGroup}
    )
    SELECT ${groupKey(ctx.query.agrupar, Prisma.sql`m.ts`, { metodo: Prisma.sql`m.metodo`, tipo: Prisma.sql`m.tipo` })} AS clave,
      sum(m.monto)::numeric(14, 2)::text AS valor
    FROM hourly m JOIN scope s ON s.proyecto_id = m.proyecto_id
    GROUP BY 1 ORDER BY 1`);
  return moneyOutput(rows, ctx.query.agrupar !== null);
};

const charges = Prisma.sql`m.movimiento = 'cobro'`;
const refunds = Prisma.sql`m.movimiento = 'reembolso'`;

export const paymentMetrics: Record<string, MetricQuery> = {
  "ingresos.cobrados": (ctx) => sum(ctx, Prisma.sql`m.monto`, charges),
  "ingresos.reembolsos": (ctx) => sum(ctx, Prisma.sql`m.monto`, refunds),
  "ingresos.netos": (ctx) => sum(ctx, Prisma.sql`CASE WHEN m.movimiento = 'reembolso' THEN -m.monto ELSE m.monto END`, Prisma.sql`TRUE`),
  "externos.cobros": (ctx) => sum(ctx, Prisma.sql`m.monto`, Prisma.sql`${charges} AND m.tipo = 'external'`),
};
