import { METRIC_CATALOG, type Dimension, type MetricId } from "./catalog";

/**
 * A range, either in each parking's local dates (`dates`: "del 1 al 15", inclusive) or as
 * absolute instants `[from, to)`. Local dates are what people ask for; instants are kept for
 * the existing dashboard.
 */
export type StatisticsRange =
  | { kind: "dates"; desde: string; hasta: string }
  | { kind: "instants"; from: number; to: number };

export interface StatisticsQuery {
  metricas: MetricId[];
  /** Already restricted to what the user may see. */
  proyectos: string[];
  rango: StatisticsRange;
  agrupar: Dimension | null;
  comparar: boolean;
}

/** ok: a value (0 included); sin_datos: no observations; no_disponible: does not apply; error: the query failed. */
export type ValueState = "ok" | "sin_datos" | "no_disponible" | "error";

export interface SeriesPoint {
  clave: string;
  valor: unknown;
}

export interface MetricResult {
  id: MetricId;
  descripcion: string;
  alcance: "periodo" | "actual";
  unidad: string;
  estado: ValueState;
  /** Money: decimal text ("1250.50") with `moneda`; counts: numbers; others: an object. */
  valor: unknown;
  moneda?: string;
  serie?: SeriesPoint[];
  /** Same metric in the previous period of the same length. */
  anterior?: unknown;
  error?: string;
}

export interface ProjectCoverage {
  proyectoId: string;
  zonaHoraria: string;
  /** Last event received from its installation; null if it never sent one. */
  ultimoDato: number | null;
  rezagoMs: number | null;
  desactualizada: boolean;
}

/** Reads metrics; the implementation aggregates in the database. */
export abstract class MetricsReader {
  abstract read(metric: MetricId, query: StatisticsQuery, now: number): Promise<Pick<MetricResult, "estado" | "valor" | "moneda" | "serie">>;
  abstract coverage(proyectos: string[], now: number): Promise<ProjectCoverage[]>;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
export const STALE_AFTER_MS = 15 * 60_000;

const dayCount = (desde: string, hasta: string) => Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / DAY_MS) + 1;

/** Days covered by a range (for the limits per grouping). */
export const rangeDays = (range: StatisticsRange) =>
  range.kind === "dates" ? dayCount(range.desde, range.hasta) : Math.ceil((range.to - range.from) / DAY_MS);

/** The period of the same length right before it. */
export const previousRange = (range: StatisticsRange): StatisticsRange => {
  if (range.kind === "instants") return { kind: "instants", from: range.from - (range.to - range.from), to: range.from };
  const days = dayCount(range.desde, range.hasta);
  const shift = (date: string, by: number) => new Date(Date.parse(`${date}T00:00:00Z`) + by * DAY_MS).toISOString().slice(0, 10);
  return { kind: "dates", desde: shift(range.desde, -days), hasta: shift(range.desde, -1) };
};

/** Longest range per grouping, so a query stays bounded. */
const MAX_DAYS: Record<Dimension | "total", number> = { hora: 31, dia: 400, total: 400, proyecto: 400, metodo: 400, tipo: 400 };

/**
 * Validates the request (strings from the query string). Returns the problem in Spanish, or the
 * query without projects (the caller adds the ones the user may see).
 */
export const parseStatisticsQuery = (raw: Record<string, unknown>): [string, null] | [null, Omit<StatisticsQuery, "proyectos"> & { proyectosPedidos: string[] | null }] => {
  const list = (value: unknown) => (typeof value === "string" ? value.split(",").map((item) => item.trim()).filter(Boolean) : []);
  const metricas = list(raw.metricas);
  if (!metricas.length) return ["Indica al menos una métrica en 'metricas'", null];
  const unknown = metricas.find((id) => !Object.hasOwn(METRIC_CATALOG, id));
  if (unknown) return [`Métrica desconocida: ${unknown}`, null];
  if (metricas.length > 20) return ["Máximo 20 métricas por consulta", null];

  let rango: StatisticsRange;
  const desde = String(raw.desde ?? ""), hasta = String(raw.hasta ?? "");
  if (DATE.test(desde) && DATE.test(hasta)) {
    if (!Number.isFinite(Date.parse(`${desde}T00:00:00Z`)) || !Number.isFinite(Date.parse(`${hasta}T00:00:00Z`)) || hasta < desde) {
      return ["'desde' y 'hasta' deben ser fechas válidas y 'hasta' no puede ser anterior", null];
    }
    rango = { kind: "dates", desde, hasta };
  } else if (/^\d{10,15}$/.test(desde) && /^\d{10,15}$/.test(hasta) && Number(hasta) > Number(desde)) {
    rango = { kind: "instants", from: Number(desde), to: Number(hasta) };
  } else {
    return ["'desde' y 'hasta' deben ser fechas (AAAA-MM-DD) o instantes en milisegundos", null];
  }

  const agrupar = raw.agrupar === undefined || raw.agrupar === "" ? null : String(raw.agrupar);
  if (agrupar !== null) {
    if (!(["proyecto", "dia", "hora", "metodo", "tipo"] as string[]).includes(agrupar)) return [`Agrupación desconocida: ${agrupar}`, null];
    const unsupported = metricas.find((id) => !(METRIC_CATALOG[id as MetricId].agrupaciones as readonly string[]).includes(agrupar));
    if (unsupported) return [`La métrica ${unsupported} no se puede agrupar por ${agrupar}`, null];
  }
  const max = MAX_DAYS[(agrupar ?? "total") as Dimension | "total"];
  if (rangeDays(rango) > max) return [`El rango máximo es de ${max} días${agrupar ? ` al agrupar por ${agrupar}` : ""}`, null];

  const pedidos = list(raw.proyectos);
  if (pedidos.some((id) => !/^[0-9a-f-]{36}$/i.test(id))) return ["'proyectos' debe ser una lista de IDs de proyecto", null];
  return [null, {
    metricas: metricas as MetricId[], rango, agrupar: agrupar as Dimension | null,
    comparar: raw.comparar === "true" || raw.comparar === true, proyectosPedidos: pedidos.length ? pedidos : null,
  }];
};
