import { Request, Response } from "express";
import { projectAccessFromRequest } from "../../middlewares/auth.middleware";
import { ErrorService } from "../../services/error.service";
import type { OccupancyOverviewService } from "../../services/occupancy/occupancy-overview.service";

export class OccupancyOverviewController {
  constructor(private readonly service: OccupancyOverviewService) {}

  list = async (req: Request, res: Response) => {
    try {
      return res.status(200).json(await this.service.list(projectAccessFromRequest(req)));
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  today = async (req: Request, res: Response) => {
    try {
      const proyectoId = String(req.params.proyectoId ?? "").trim();
      return res.status(200).json(await this.service.today(proyectoId, projectAccessFromRequest(req)));
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };
}
