import type { Request, Response } from "express";
import { METRIC_CATALOG } from "../../../domain/statistics/catalog";
import { parseStatisticsQuery } from "../../../domain/statistics/statistics";
import { projectAccessFromRequest } from "../../middlewares";
import { ErrorService } from "../../services/error.service";
import { statisticsCsv } from "../../services/statistics/statistics-csv";
import type { StatisticsService } from "../../services/statistics/statistics.service";

/** HTTP for statistics (docs/estadisticas.md §5): parses filters, applies the user's scope. */
export class StatisticsController {
  constructor(private readonly statistics: StatisticsService) {}

  /** What can be asked: the catalog with each metric's definition (§4). */
  catalog = (_req: Request, res: Response) => res.json({ metricas: METRIC_CATALOG });

  query = async (req: Request, res: Response) => {
    try {
      const request = await this.parse(req, res);
      if (!request) return;
      return res.json(await this.statistics.run(request.query));
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  /** The same metrics and filters as a CSV that says what is missing. */
  export = async (req: Request, res: Response) => {
    try {
      const request = await this.parse(req, res);
      if (!request) return;
      const csv = statisticsCsv(await this.statistics.run(request.query), request.query, request.projects);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${csv.filename}"`);
      if (csv.partial) res.setHeader("X-Viggo-Parcial", "true");
      for (const line of csv.lines) res.write(line);
      return res.end();
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  /** The validated query with the parkings in scope; answers 400 itself when invalid. */
  private async parse(req: Request, res: Response) {
    const [error, parsed] = parseStatisticsQuery(req.query as Record<string, unknown>);
    if (error || !parsed) {
      res.status(400).json({ error });
      return null;
    }
    const { proyectosPedidos, ...query } = parsed;
    const projects = await this.statistics.projectsInScope(projectAccessFromRequest(req), proyectosPedidos);
    return { query: { ...query, proyectos: projects.map((project) => project.id) }, projects };
  }
}
