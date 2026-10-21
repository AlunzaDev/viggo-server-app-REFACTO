import type { Request, Response } from "express";
import { DashboardQueryDto } from "../../../domain/dtos/dashboard/dashboard-query.dto";
import { ErrorService } from "../../services/error.service";
import type { DashboardService } from "../../services/dashboard/dashboard.service";
import type { StatisticsService } from "../../services/statistics/statistics.service";
import { projectAccessFromRequest } from "../../middlewares";

export class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly statistics: StatisticsService,
  ) {}

  getMetrics = async (req: Request, res: Response) => {
    try {
      const [error, dto] = DashboardQueryDto.create(req.query as Record<string, unknown>);
      if (error || !dto) return res.status(400).json({ error });
      const projects = await this.statistics.projectsInScope(projectAccessFromRequest(req), dto.projectId ? [dto.projectId] : null);
      return res.json(await this.dashboard.getMetrics(projects.map((project) => project.id), dto.from, dto.to));
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };
}
