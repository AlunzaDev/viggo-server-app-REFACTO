import type { StatisticsProject, StatisticsQuery } from "../../../domain/statistics/statistics";
import type { StatisticsResponse } from "./statistics.service";

/**
 * One CSV line. Objects (a stay breakdown, the connectivity list) go as JSON; text that a
 * spreadsheet would run as a formula (=, +, -, @) is prefixed so it stays text.
 */
export const csvRow = (cells: unknown[]) => cells.map((cell) => {
  let text = cell === null || cell === undefined ? "" : typeof cell === "object" ? JSON.stringify(cell) : String(cell);
  if (/^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}).join(",") + "\r\n";

/**
 * A statistics result as a CSV (docs/estadisticas.md §5): one row per metric and group, with
 * parking names, and closing warnings when it is partial or a parking is behind. Starts with a
 * BOM so Excel reads the accents.
 */
export const statisticsCsv = (result: StatisticsResponse, query: Pick<StatisticsQuery, "rango" | "agrupar">, projects: StatisticsProject[]) => {
  const names = new Map(projects.map((project) => [project.id, project.nombre]));
  const range = query.rango.kind === "dates" ? `${query.rango.desde}_${query.rango.hasta}` : `${query.rango.from}_${query.rango.to}`;
  const lines = ["\uFEFF" + csvRow(["metrica", "descripcion", "grupo", "valor", "unidad", "moneda", "estado"])];
  for (const metric of result.metricas) {
    const rows = metric.serie?.length ? metric.serie : [{ clave: "total", valor: metric.valor }];
    for (const row of rows) {
      const group = query.agrupar === "proyecto" ? names.get(row.clave) ?? row.clave : row.clave;
      lines.push(csvRow([metric.id, metric.descripcion, group, row.valor, metric.unidad, metric.moneda ?? "", metric.estado]));
    }
  }
  // Never passed off as complete: the file itself says what is missing.
  if (result.parcial) lines.push(csvRow(["AVISO", "Reporte parcial: alguna métrica no se pudo calcular", "", "", "", "", "error"]));
  const stale = result.cobertura.filter((item) => item.desactualizada).map((item) => names.get(item.proyectoId) ?? item.proyectoId);
  if (stale.length) lines.push(csvRow(["AVISO", `Sedes sin sincronizar en los últimos 15 minutos: ${stale.join("; ")}`, "", "", "", "", "desactualizada"]));
  return { filename: `estadisticas_${range}.csv`, partial: result.parcial, lines };
};
