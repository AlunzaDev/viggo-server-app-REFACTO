import { Prisma } from "../../../generated/prisma/client";
import { groupKey, inRange, moneyOutput, scope, type MetricContext, type MetricQuery } from "../statistics-sql";

// All money comes from statistics_payments: one row per real charge (docs/estadisticas.md §4.1).
const own = { metodo: Prisma.sql`sp.method`, tipo: Prisma.sql`sp.payment_type` };

/** Charges by their payment date (succeeded or later refunded: they were charged). */
const charged = (ctx: MetricContext, sign = Prisma.sql`1`, extra = Prisma.empty) => Prisma.sql`
  SELECT ${groupKey(ctx.query.agrupar, Prisma.sql`sp.paid_at`, own)} AS clave, sp.amount * ${sign} AS amount
  FROM statistics_payments sp JOIN scope s ON s.proyecto_id = sp.proyecto_id
  WHERE sp.status IN ('succeeded', 'refunded') AND sp.currency = 'MXN' AND ${inRange(Prisma.sql`sp.paid_at`)} ${extra}`;

/** Refunds by the date they were made (docs/estadisticas.md §4.3). */
const refunded = (ctx: MetricContext, sign = Prisma.sql`1`) => Prisma.sql`
  SELECT ${groupKey(ctx.query.agrupar, Prisma.sql`sp.refunded_at`, own)} AS clave, sp.amount * ${sign} AS amount
  FROM statistics_payments sp JOIN scope s ON s.proyecto_id = sp.proyecto_id
  WHERE sp.status = 'refunded' AND sp.currency = 'MXN' AND sp.refunded_at IS NOT NULL AND ${inRange(Prisma.sql`sp.refunded_at`)}`;

const sum = async (ctx: MetricContext, rows: Prisma.Sql) => {
  const result = await ctx.db.$queryRaw<Array<{ clave: string; valor: string }>>(Prisma.sql`
    WITH ${scope(ctx.query.proyectos, ctx.query.rango)}
    SELECT clave, sum(amount)::numeric(14, 2)::text AS valor FROM (${rows}) x GROUP BY clave ORDER BY clave`);
  return moneyOutput(result, ctx.query.agrupar !== null);
};

export const paymentMetrics: Record<string, MetricQuery> = {
  "ingresos.cobrados": (ctx) => sum(ctx, charged(ctx)),
  "ingresos.reembolsos": (ctx) => sum(ctx, refunded(ctx)),
  "ingresos.netos": (ctx) => sum(ctx, Prisma.sql`${charged(ctx)} UNION ALL ${refunded(ctx, Prisma.sql`-1`)}`),
  "externos.cobros": (ctx) => sum(ctx, charged(ctx, Prisma.sql`1`, Prisma.sql`AND sp.payment_type = 'external'`)),
};
