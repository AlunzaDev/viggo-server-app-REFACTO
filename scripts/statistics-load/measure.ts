/**
 * Load test of statistics (docs/estadisticas-carga.md, #52). Runs the scenarios of
 * docs/estadisticas.md §7 with concurrent requests while events are ingested, and reports
 * latencies, Node memory and database connections. With --explain, prints the plan of each
 * dashboard metric instead.
 *
 *   DATABASE_URL=postgresql://.../viggo_administrativo_load npx tsx scripts/statistics-load/measure.ts [--runs 30] [--concurrency 10] [--explain]
 */
import { randomUUID } from "node:crypto";
import { PostgresDatabase } from "../../src/data/postgres";
import { Prisma } from "../../src/generated/prisma/client";
import type { MetricId } from "../../src/domain/statistics/catalog";
import type { StatisticsQuery } from "../../src/domain/statistics/statistics";
import { OperationalInboxProcessor } from "../../src/infrastructure/datasources/sync/operational-inbox.processor";
import { METRIC_QUERIES } from "../../src/infrastructure/statistics/metrics-reader.postgres";
import { buildDashboardService, buildStatisticsService } from "../../src/presentation/dependencies";

const arg = (name: string, fallback: number) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? Number(process.argv[index + 1]) : fallback;
};
const RUNS = arg("runs", 30);
const CONCURRENCY = arg("concurrency", 10);
const POOL = arg("pool", 10);
const DAY = 86_400_000;

const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0;
};
const ms = (value: number) => `${Math.round(value)} ms`;
const mb = (value: number) => `${Math.round(value / 1024 / 1024)} MB`;

/** `RUNS` executions of `task`, `CONCURRENCY` at a time; latencies in ms. */
const load = async (task: (run: number) => Promise<unknown>) => {
  const latencies: number[] = [];
  let next = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < RUNS) {
      const run = next++;
      const start = performance.now();
      await task(run);
      latencies.push(performance.now() - start);
    }
  }));
  return latencies;
};

/** Meanwhile, the inbox keeps receiving a ticket every 50 ms (the cloud's normal work). */
const ingestion = (projectIds: string[]) => {
  const latencies: number[] = [];
  let running = true;
  const processor = new OperationalInboxProcessor();
  const loop = (async () => {
    while (running) {
      const id = randomUUID(), now = new Date();
      const start = performance.now();
      await PostgresDatabase.client.inboxEvent.create({ data: {
        eventId: randomUUID(), installationId: "load-ingest", proyectoId: projectIds[latencies.length % projectIds.length], eventType: "ticket.created",
        aggregateId: id, occurredAt: now,
        payload: { id, hora_inicio: now.toISOString(), hora_salida: null, monto: "0.00", pagado: false, status: "ACTIVE" },
      } }).then((event) => processor.processEvent(event.eventId));
      latencies.push(performance.now() - start);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  })();
  return { stop: async () => { running = false; await loop; return latencies; } };
};

/** Node memory and connections to the database, sampled while a scenario runs. */
const sampler = () => {
  let rss = 0, heap = 0, connections = 0;
  const timer = setInterval(() => {
    const memory = process.memoryUsage();
    rss = Math.max(rss, memory.rss); heap = Math.max(heap, memory.heapUsed);
  }, 50);
  const db = setInterval(() => {
    void PostgresDatabase.client.$queryRaw<Array<{ n: number }>>`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database()`
      .then(([row]) => { connections = Math.max(connections, row.n); }).catch(() => undefined);
  }, 500);
  return { stop: () => { clearInterval(timer); clearInterval(db); return { rss, heap, connections }; } };
};

/** The SQL each metric sends, captured instead of executed, and its plan with real timings. */
const explain = async (metric: MetricId, query: StatisticsQuery, now: number) => {
  const sent: Prisma.Sql[] = [];
  const capture = { $queryRaw: async (sql: Prisma.Sql) => { sent.push(sql); return []; } } as unknown as Prisma.TransactionClient;
  await METRIC_QUERIES[metric]({ db: capture, query, now }).catch(() => undefined);
  for (const sql of sent) {
    const plan = await PostgresDatabase.client.$queryRawUnsafe<Array<{ "QUERY PLAN": string }>>(`EXPLAIN (ANALYZE, BUFFERS) ${sql.text}`, ...sql.values);
    const lines = plan.map((row) => row["QUERY PLAN"]);
    console.log(`\n### ${metric}\n${lines.filter((line) => /Execution Time|Planning Time|Seq Scan|Index|Sort Method|Buffers: shared hit=\d+ read=\d+$/.test(line)).slice(0, 14).join("\n")}\n  ${lines.at(-1)}`);
  }
};

const main = async () => {
  const databaseUrl = process.env.DATABASE_URL ?? "";
  if (!/_load(\?|$)/.test(databaseUrl)) throw new Error("DATABASE_URL debe apuntar a una base *_load (docs/estadisticas-carga.md)");
  await PostgresDatabase.connect({ databaseUrl, poolMax: POOL });
  const projects = (await PostgresDatabase.client.proyecto.findMany({ where: { identificador: { startsWith: "load-" } }, select: { id: true }, orderBy: { identificador: "asc" } }))
    .map((project) => project.id);
  if (!projects.length) throw new Error("La base no tiene datos de carga: corre scripts/statistics-load/seed.sql");
  const now = Date.now();
  const dashboard = buildDashboardService();
  const statistics = buildStatisticsService();
  const today = new Date(now).toISOString().slice(0, 10);
  const yearAgo = new Date(now - 364 * DAY).toISOString().slice(0, 10);

  if (process.argv.includes("--explain")) {
    const base = { rango: { kind: "instants" as const, from: now - 30 * DAY, to: now }, comparar: false };
    const metrics: Array<[MetricId, StatisticsQuery["agrupar"]]> = [["ingresos.netos", null], ["ingresos.netos", "dia"], ["ingresos.netos", "metodo"],
      ["tickets.entradas", "hora"], ["tickets.estancia", null], ["tickets.ticket_promedio", null], ["operacion.autos_dentro", null], ["operacion.ocupacion_horaria", "hora"]];
    for (const [label, proyectos] of [["1 sede, 30 días", projects.slice(0, 1)], ["todas las sedes, 30 días", projects]] as const) {
      console.log(`\n## ${label}`);
      for (const [metric, agrupar] of metrics) await explain(metric, { ...base, proyectos: [...proyectos], metricas: [metric], agrupar }, now);
    }
    console.log("\n## todas las sedes, 12 meses por día");
    await explain("ingresos.netos", { proyectos: projects, metricas: ["ingresos.netos"], rango: { kind: "dates", desde: yearAgo, hasta: today }, agrupar: "dia", comparar: false }, now);
    await PostgresDatabase.disconnect();
    return;
  }

  const scenarios: Array<[string, (run: number) => Promise<unknown>]> = [
    ["Dashboard de 1 sede, 30 días", (run) => dashboard.getMetrics([projects[run % projects.length]], now - 30 * DAY, now, now)],
    ["Dashboard de todas las sedes, 30 días", () => dashboard.getMetrics(projects, now - 30 * DAY, now, now)],
    ["Consolidado por día, 12 meses", () => statistics.run({ proyectos: projects, metricas: ["ingresos.netos", "tickets.entradas"],
      rango: { kind: "dates", desde: yearAgo, hasta: today }, agrupar: "dia", comparar: false }, now)],
  ];
  console.log(`${projects.length} sedes · ${RUNS} ejecuciones por escenario · ${CONCURRENCY} simultáneas · pool ${POOL}\n`);
  console.log("| Escenario | p50 | p95 | p99 | máx | RSS máx | heap máx | conexiones máx | ingestión p95 |");
  console.log("|---|---|---|---|---|---|---|---|---|");
  for (const [name, task] of scenarios) {
    await task(0); // warm-up: the first run reads from disk
    const ingest = ingestion(projects), sample = sampler();
    const latencies = await load(task);
    const usage = sample.stop(), inbox = await ingest.stop();
    console.log(`| ${name} | ${ms(percentile(latencies, 50))} | ${ms(percentile(latencies, 95))} | ${ms(percentile(latencies, 99))} | ${ms(Math.max(...latencies))} | ${mb(usage.rss)} | ${mb(usage.heap)} | ${usage.connections} | ${ms(percentile(inbox, 95))} (${inbox.length} eventos) |`);
  }
  await PostgresDatabase.client.$executeRaw`DELETE FROM operational_tickets WHERE installation_id = 'load-ingest'`;
  await PostgresDatabase.client.$executeRaw`DELETE FROM inbox_events WHERE installation_id = 'load-ingest'`;
  await PostgresDatabase.disconnect();
};

main().catch((error) => { console.error(error); process.exit(1); });
