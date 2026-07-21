import { Request, Response } from "express";
import { ErrorService } from "../../services/error.service";
import { CashTicketPaymentService } from "../../services/payments/cash-ticket-payment.service";

export class CashTicketPaymentController {
  constructor(
    private readonly cashTicketPaymentService: CashTicketPaymentService,
  ) {}

  resolveTicketFromQr = async (req: Request, res: Response) => {
    try {
      const { qrValue } = req.body as { qrValue?: unknown };

      if (typeof qrValue !== "string" || qrValue.trim().length === 0) {
        return res.status(400).json({ error: "'qrValue' es requerido" });
      }

      const result = await this.cashTicketPaymentService.resolveTicketFromQr(
        qrValue.trim(),
      );

      return res.status(200).json(result);
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  startCashSession = async (req: Request, res: Response) => {
    try {
      const ticketId = String(req.params.ticketId);
      const { deviceId } = req.body as { deviceId?: unknown };

      const session = await this.cashTicketPaymentService.startCashSession(
        ticketId,
        typeof deviceId === "string" ? deviceId : undefined,
      );

      return res.status(201).json({ session });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  registerCashInsertion = async (req: Request, res: Response) => {
    try {
      const sessionId = String(req.params.sessionId);
      const { amount, rawEvent } = req.body as {
        amount?: unknown;
        rawEvent?: Record<string, unknown>;
      };

      if (typeof amount !== "number") {
        return res.status(400).json({ error: "'amount' debe ser numerico" });
      }

      const session = await this.cashTicketPaymentService.registerCashInsertion(
        sessionId,
        amount,
        rawEvent,
      );

      return res.status(200).json({ session });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  cancelSession = async (req: Request, res: Response) => {
    try {
      const sessionId = String(req.params.sessionId);
      const session =
        await this.cashTicketPaymentService.cancelSession(sessionId);

      return res.status(200).json({ session });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getSessionById = async (req: Request, res: Response) => {
    try {
      const sessionId = String(req.params.sessionId);
      const session =
        await this.cashTicketPaymentService.getSessionById(sessionId);

      return res.status(200).json({ session });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };
}
