import { METRIC_CATALOG } from "../../../domain/statistics/catalog";
import {
  MetricsReader,
  previousRange,
  type MetricResult,
  type ProjectCoverage,
  type StatisticsQuery,
} from "../../../domain/statistics/statistics";

export interface StatisticsResponse {
  metricas: MetricResult[];
  cobertura: ProjectCoverage[];
  /** Some metric failed: totals must not be read as complete. */
  parcial: boolean;
  /** The parkings do not share a time zone (each one's days are its own). */
  zonasMezcladas: boolean;
  generadoEn: number;
}

/** Runs the requested metrics; each one stands alone, so one failure does not hide the rest. */
export class StatisticsService {
  constructor(private readonly reader: MetricsReader) {}

  async run(query: StatisticsQuery, now = Date.now(), options: { coverage?: boolean } = {}): Promise<StatisticsResponse> {
    const metricas: MetricResult[] = [];
    // One after another: a dashboard asks few metrics and this keeps the pool free for ingestion.
    for (const id of query.metricas) {
      const definition = METRIC_CATALOG[id];
      const base = { id, descripcion: definition.descripcion, alcance: definition.alcance, unidad: definition.unidad };
      try {
        const current = await this.reader.read(id, query, now);
        const result: MetricResult = { ...base, ...current };
        if (query.comparar && definition.comparable && current.estado === "ok") {
          const previous = await this.reader.read(id, { ...query, rango: previousRange(query.rango), agrupar: null }, now);
          result.anterior = previous.estado === "ok" ? previous.valor : null;
        }
        metricas.push(result);
      } catch (error) {
        // The detail stays in the log: a response never carries SQL or internal messages.
        console.error(`[statistics] ${id} failed`, error);
        metricas.push({ ...base, estado: "error", valor: null, error: "No se pudo calcular esta métrica" });
      }
    }
    const cobertura = options.coverage === false ? [] : await this.reader.coverage(query.proyectos, now);
    return {
      metricas,
      cobertura,
      parcial: metricas.some((metric) => metric.estado === "error"),
      zonasMezcladas: new Set(cobertura.map((project) => project.zonaHoraria)).size > 1,
      generadoEn: now,
    };
  }
}
