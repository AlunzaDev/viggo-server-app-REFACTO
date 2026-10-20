import { PostgresDatabase } from "../../data/postgres";
import { Prisma } from "../../generated/prisma/client";
import { METRIC_IDS, type MetricId } from "../../domain/statistics/catalog";
import { MetricsReader, STALE_AFTER_MS, type ProjectCoverage, type StatisticsQuery } from "../../domain/statistics/statistics";
import { paymentMetrics } from "./metrics/payments.metrics";
import { pensionAndOperationMetrics } from "./metrics/pensions-operations.metrics";
import { ticketMetrics } from "./metrics/tickets.metrics";
import type { MetricOutput, MetricQuery } from "./statistics-sql";

/** Every metric of the catalog with its query. A missing one fails at startup, not at request time. */
export const METRIC_QUERIES: Record<MetricId, MetricQuery> = {
  ...paymentMetrics,
  ...ticketMetrics,
  ...pensionAndOperationMetrics,
} as Record<MetricId, MetricQuery>;
const missing = METRIC_IDS.filter((id) => typeof METRIC_QUERIES[id] !== "function");
if (missing.length) throw new Error(`Metrics without a query: ${missing.join(", ")}`);

/** A statistics query never holds a connection for long nor blocks the inbox. */
const STATEMENT_TIMEOUT = "15s";

export class PostgresMetricsReader extends MetricsReader {
  async read(metric: MetricId, query: StatisticsQuery, now: number): Promise<MetricOutput> {
    const run = METRIC_QUERIES[metric];
    if (!query.proyectos.length) return this.empty(metric);
    return PostgresDatabase.client.$transaction(async (db) => {
      await db.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      await db.$executeRawUnsafe(`SET LOCAL statement_timeout = '${STATEMENT_TIMEOUT}'`);
      return run({ db, query, now });
    }, { timeout: 30_000 });
  }

  /** No parkings in scope: zero or no data, never an error. */
  private empty(metric: MetricId): MetricOutput {
    if (metric === "operacion.conectividad") return { estado: "ok", valor: [] };
    if (metric === "tickets.ticket_promedio" || metric === "tickets.estancia") return { estado: "sin_datos", valor: null };
    if (metric.startsWith("ingresos.") || metric === "externos.cobros") return { estado: "ok", valor: "0.00", moneda: "MXN" };
    return { estado: "ok", valor: 0 };
  }

  async coverage(proyectos: string[], now: number): Promise<ProjectCoverage[]> {
    if (!proyectos.length) return [];
    // Last event of each parking's OPERATIVO (index on proyecto_id, occurred_at).
    const rows = await PostgresDatabase.client.$queryRaw<Array<{ proyecto_id: string; zona: string; ultimo: Date | null }>>(Prisma.sql`
      SELECT p.id::text AS proyecto_id, p.zona_horaria AS zona,
        (SELECT max(e.occurred_at) FROM inbox_events e WHERE e.proyecto_id = p.id) AS ultimo
      FROM proyectos p WHERE p.id IN (${Prisma.join(proyectos.map((id) => Prisma.sql`${id}::uuid`))})`);
    return rows.map((row) => {
      const last = row.ultimo?.getTime() ?? null;
      const lag = last === null ? null : Math.max(0, now - last);
      return { proyectoId: row.proyecto_id, zonaHoraria: row.zona, ultimoDato: last, rezagoMs: lag, desactualizada: lag === null || lag > STALE_AFTER_MS };
    });
  }
}
