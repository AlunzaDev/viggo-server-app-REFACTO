import { Router, type Request } from "express";
import { PostgresDatabase } from "../../../data/postgres";
import { CustomError } from "../../../domain/errors/custom.error";
import { METRIC_CATALOG } from "../../../domain/statistics/catalog";
import { parseStatisticsQuery } from "../../../domain/statistics/statistics";
import { PostgresMetricsReader } from "../../../infrastructure/statistics/metrics-reader.postgres";
import { AuthMiddleware, getAllowedProjectIdsFromRequest, isSuperAdminRequest } from "../../middlewares";
import { ErrorService } from "../../services/error.service";
import { StatisticsService } from "../../services/statistics/statistics.service";

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
    return router;
  }
}
