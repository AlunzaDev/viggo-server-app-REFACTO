import { Request, Response } from "express";
import { ConnectionHistoryQueryDto } from "../../../domain/dtos/heartbeat/connection-history-query.dto";
import { projectAccessFromRequest } from "../../middlewares/auth.middleware";
import { ErrorService } from "../../services/error.service";
import type { ConnectionHistoryService } from "../../services/heartbeat/connection-history.service";

export class ConnectionHistoryController {
  constructor(private readonly service: ConnectionHistoryService) {}

  list = async (req: Request, res: Response) => {
    try {
      const [error, query] = ConnectionHistoryQueryDto.create(req.query as Record<string, unknown>);
      if (error || !query) return res.status(400).json({ error });
      return res.status(200).json(await this.service.list(query, projectAccessFromRequest(req)));
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  downtime = async (req: Request, res: Response) => {
    try {
      const [error, query] = ConnectionHistoryQueryDto.create(req.query as Record<string, unknown>);
      if (error || !query) return res.status(400).json({ error });
      return res.status(200).json(await this.service.downtime(query, projectAccessFromRequest(req)));
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };
}
