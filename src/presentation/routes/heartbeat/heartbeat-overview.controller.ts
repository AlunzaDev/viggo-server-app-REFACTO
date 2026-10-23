import { Request, Response } from "express";
import { projectAccessFromRequest } from "../../middlewares/auth.middleware";
import { ErrorService } from "../../services/error.service";
import type { HeartbeatOverviewService } from "../../services/heartbeat/heartbeat-overview.service";

export class HeartbeatOverviewController {
  constructor(private readonly service: HeartbeatOverviewService) {}

  get = async (req: Request, res: Response) => {
    try {
      return res.status(200).json(await this.service.get(projectAccessFromRequest(req)));
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };
}
