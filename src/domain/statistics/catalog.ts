/**
 * Catalog of statistics (docs/estadisticas.md §4). Each metric declares what it measures and
 * how it may be grouped; its SQL lives in infrastructure/statistics. Adding one is adding an
 * entry here and its query there.
 */
export const DIMENSIONS = ["proyecto", "dia", "hora", "metodo", "tipo"] as const;
export type Dimension = (typeof DIMENSIONS)[number];

export type MetricUnit = "dinero" | "conteo" | "minutos" | "estado";

export interface MetricDefinition {
  descripcion: string;
  /** periodo: depends on the requested range; actual: the state now (the range does not apply). */
  alcance: "periodo" | "actual";
  unidad: MetricUnit;
  agrupaciones: readonly Dimension[];
  /** Whether a previous-period comparison makes sense. */
  comparable: boolean;
}

export const METRIC_CATALOG = {
  "ingresos.cobrados": {
    descripcion: "Cobros exitosos con fecha de pago en el periodo, incluidos los externos (sin restar reembolsos)",
    alcance: "periodo", unidad: "dinero", agrupaciones: ["proyecto", "dia", "hora", "metodo", "tipo"], comparable: true,
  },
  "ingresos.reembolsos": {
    descripcion: "Reembolsos hechos en el periodo (por su fecha de reembolso)",
    alcance: "periodo", unidad: "dinero", agrupaciones: ["proyecto", "dia", "metodo", "tipo"], comparable: true,
  },
  "ingresos.netos": {
    descripcion: "Cobrados menos reembolsos del mismo periodo",
    alcance: "periodo", unidad: "dinero", agrupaciones: ["proyecto", "dia", "metodo", "tipo"], comparable: true,
  },
  "tickets.entradas": {
    descripcion: "Tickets con entrada en el periodo",
    alcance: "periodo", unidad: "conteo", agrupaciones: ["proyecto", "dia", "hora"], comparable: true,
  },
  "tickets.salidas": {
    descripcion: "Tickets con salida en el periodo",
    alcance: "periodo", unidad: "conteo", agrupaciones: ["proyecto", "dia", "hora"], comparable: true,
  },
  "tickets.ticket_promedio": {
    descripcion: "Monto promedio de los tickets pagados que salieron en el periodo",
    alcance: "periodo", unidad: "dinero", agrupaciones: ["proyecto", "dia"], comparable: true,
  },
  "tickets.estancia": {
    descripcion: "Minutos entre entrada y salida de los tickets que salieron en el periodo: promedio, mediana y rangos",
    alcance: "periodo", unidad: "minutos", agrupaciones: ["proyecto"], comparable: false,
  },
  "pensiones.vigentes": {
    descripcion: "Pases con usuario, activos y vigentes ahora",
    alcance: "actual", unidad: "conteo", agrupaciones: ["proyecto"], comparable: false,
  },
  "pensiones.por_vencer": {
    descripcion: "Pases vigentes que vencen en los próximos 7 días",
    alcance: "actual", unidad: "conteo", agrupaciones: ["proyecto"], comparable: false,
  },
  "pensiones.movimientos": {
    descripcion: "Entradas y salidas de pensionados en el periodo",
    alcance: "periodo", unidad: "conteo", agrupaciones: ["proyecto", "dia", "hora", "tipo"], comparable: true,
  },
  "externos.cobros": {
    descripcion: "Cobrado por cuenta de proveedores externos (ya incluido en ingresos como tipo externo)",
    alcance: "periodo", unidad: "dinero", agrupaciones: ["proyecto", "dia"], comparable: true,
  },
  "operacion.conectividad": {
    descripcion: "Último contacto de cada instalación y su estado: en línea (≤ 15 s), intermitente (≤ 60 s) o desconectada",
    alcance: "actual", unidad: "estado", agrupaciones: [], comparable: false,
  },
} as const satisfies Record<string, MetricDefinition>;

export type MetricId = keyof typeof METRIC_CATALOG;
export const METRIC_IDS = Object.keys(METRIC_CATALOG) as MetricId[];
export const isMetricId = (value: string): value is MetricId => Object.hasOwn(METRIC_CATALOG, value);
