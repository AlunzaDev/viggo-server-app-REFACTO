import { Request, Response } from "express";
import {
  getAllowedProjectIdsFromRequest,
  getAuthenticatedRequestUser,
  isSuperAdminRequest,
} from "../../middlewares";
import { ErrorService } from "../../services/error.service";
import {
  CashPaymentActorContext,
  CashTicketPaymentService,
} from "../../services/payments/cash-ticket-payment.service";

type AuthenticatedRequest = Request & { uid?: string };

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
        getAllowedProjectIdsFromRequest(req),
      );

      return res.status(200).json(result);
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  startCashSession = async (req: Request, res: Response) => {
    try {
      const ticketId = String(req.params.ticketId);
      const { moduloId } = req.body as { moduloId?: unknown };

      if (typeof moduloId !== "string" || moduloId.trim().length === 0) {
        return res.status(400).json({ error: "'moduloId' es requerido" });
      }

      const session = await this.cashTicketPaymentService.startCashSession(
        ticketId,
        moduloId.trim(),
        this.buildActorContext(req),
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
        this.buildActorContext(req),
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
      const { cancellationReason } = req.body as {
        cancellationReason?: unknown;
      };
      const session = await this.cashTicketPaymentService.cancelSession(
        sessionId,
        this.buildActorContext(req),
        typeof cancellationReason === "string" ? cancellationReason : undefined,
      );

      return res.status(200).json({ session });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getSessionById = async (req: Request, res: Response) => {
    try {
      const sessionId = String(req.params.sessionId);
      const session =
        await this.cashTicketPaymentService.getSessionById(
          sessionId,
          getAllowedProjectIdsFromRequest(req),
        );

      return res.status(200).json({ session });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  private buildActorContext(req: Request): CashPaymentActorContext {
    const authRequest = req as AuthenticatedRequest;
    const authUser = getAuthenticatedRequestUser(req) as
      | (Record<string, unknown> & { nombre?: unknown; apellido?: unknown })
      | undefined;

    const fullName = [authUser?.nombre, authUser?.apellido]
      .map((value) => (typeof value === "string" ? value.trim() : ""))
      .filter(Boolean)
      .join(" ");

    return {
      userId: String(authRequest.uid ?? ""),
      userName: fullName || undefined,
      allowedProjectIds: getAllowedProjectIdsFromRequest(req),
      isSuperAdmin: isSuperAdminRequest(req),
    };
  }
}
