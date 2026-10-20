import { Router, type Request } from "express";
import { PostgresDatabase } from "../../../data/postgres";
import { CustomError } from "../../../domain/errors/custom.error";
import { METRIC_CATALOG } from "../../../domain/statistics/catalog";
import { parseStatisticsQuery } from "../../../domain/statistics/statistics";
import { PostgresMetricsReader } from "../../../infrastructure/statistics/metrics-reader.postgres";
import { AuthMiddleware, getAllowedProjectIdsFromRequest, isSuperAdminRequest } from "../../middlewares";
import { ErrorService } from "../../services/error.service";
import { StatisticsService } from "../../services/statistics/statistics.service";
import { csvRow } from "./csv";

/**
 * The parkings a request may see: the ones asked for, all of them only if the user can see
 * each one (SUPER sees every parking), also in consolidated figures.
 */
export const statisticsProjects = async (req: Request, requested: string[] | null) => {
  const allowed = isSuperAdminRequest(req) ? null : new Set(getAllowedProjectIdsFromRequest(req));
  if (requested) {
    if (allowed && requested.some((id) => !allowed.has(id))) throw CustomError.forbidden("No tienes acceso a alguno de los proyectos solicitados");
    const existing = await PostgresDatabase.client.proyecto.findMany({ where: { id: { in: requested } }, select: { id: true } });
    return existing.map((project) => project.id);
  }
  const projects = await PostgresDatabase.client.proyecto.findMany({ where: allowed ? { id: { in: [...allowed] } } : {}, select: { id: true } });
  return projects.map((project) => project.id);
};

export class StatisticsRoutes {
  static get routes() {
    const router = Router();
    const service = new StatisticsService(new PostgresMetricsReader());

    // What can be asked: the catalog with each metric's definition (docs/estadisticas.md §4).
    router.get("/catalogo", (_req, res) => res.json({ metricas: METRIC_CATALOG }));

    router.get("/", AuthMiddleware.requireModules("payments"), async (req, res) => {
      try {
        const [error, parsed] = parseStatisticsQuery(req.query as Record<string, unknown>);
        if (error || !parsed) return res.status(400).json({ error });
        const { proyectosPedidos, ...query } = parsed;
        const proyectos = await statisticsProjects(req, proyectosPedidos);
        return res.json(await service.run({ ...query, proyectos }));
      } catch (error) {
        return ErrorService.handleApiError(error, res);
      }
    });

    // The same metrics and filters as a CSV, written row by row (docs/estadisticas.md §5).
    router.get("/exportar", AuthMiddleware.requireModules("payments"), async (req, res) => {
      try {
        const [error, parsed] = parseStatisticsQuery(req.query as Record<string, unknown>);
        if (error || !parsed) return res.status(400).json({ error });
        const { proyectosPedidos, ...query } = parsed;
        const proyectos = await statisticsProjects(req, proyectosPedidos);
        const result = await service.run({ ...query, proyectos });
        const names = new Map((await PostgresDatabase.client.proyecto.findMany({ where: { id: { in: proyectos } }, select: { id: true, nombre: true } }))
          .map((project) => [project.id, project.nombre]));
        const range = query.rango.kind === "dates" ? `${query.rango.desde}_${query.rango.hasta}` : `${query.rango.from}_${query.rango.to}`;
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="estadisticas_${range}.csv"`);
        if (result.parcial) res.setHeader("X-Viggo-Parcial", "true");
        // BOM so Excel reads the accents.
        res.write("﻿" + csvRow(["metrica", "descripcion", "grupo", "valor", "unidad", "moneda", "estado"]));
        for (const metric of result.metricas) {
          const rows = metric.serie?.length ? metric.serie : [{ clave: "total", valor: metric.valor }];
          for (const row of rows) {
            const group = query.agrupar === "proyecto" ? names.get(row.clave) ?? row.clave : row.clave;
            res.write(csvRow([metric.id, metric.descripcion, group, row.valor, metric.unidad, metric.moneda ?? "", metric.estado]));
          }
        }
        // Never passed off as complete: the file itself says what is missing.
        if (result.parcial) res.write(csvRow(["AVISO", "Reporte parcial: alguna métrica no se pudo calcular", "", "", "", "", "error"]));
        const stale = result.cobertura.filter((item) => item.desactualizada).map((item) => names.get(item.proyectoId) ?? item.proyectoId);
        if (stale.length) res.write(csvRow(["AVISO", `Sedes sin sincronizar en los últimos 15 minutos: ${stale.join("; ")}`, "", "", "", "", "desactualizada"]));
        return res.end();
      } catch (error) {
        return ErrorService.handleApiError(error, res);
      }
    });
    return router;
  }
}
