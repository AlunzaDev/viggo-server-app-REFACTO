import type { Request, Response } from "express";
import { ErrorService } from "../../services/error.service";
import type { TicketLabService } from "../../services/dev/ticket-lab.service";
import { ticketLabPageHtml } from "./ticket-lab.page";

/** HTTP for the development ticket laboratory (mounted when PROD=false). */
export class TicketLabController {
  constructor(private readonly lab: TicketLabService) {}

  page = (_req: Request, res: Response) => res.type("html").send(ticketLabPageHtml());

  context = async (_req: Request, res: Response) => {
    try {
      return res.json(await this.lab.context());
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  detect = async (req: Request, res: Response) => {
    try {
      return res.json(await this.lab.detect(Number(req.body?.longitude), Number(req.body?.latitude)));
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  payments = async (req: Request, res: Response) => {
    try {
      return res.json(await this.lab.payments(String(req.params.userId)));
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  moduleToken = async (req: Request, res: Response) => {
    try {
      return res.json(await this.lab.moduleToken(String(req.body?.moduleId ?? "").trim()));
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  createTicket = async (req: Request, res: Response) => {
    try {
      return res.status(201).json(await this.lab.createTicket(req.body ?? {}));
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };
}
