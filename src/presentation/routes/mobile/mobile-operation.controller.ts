import type { Request, Response } from "express";
import type { MobileOperationRecord } from "../../../domain/datasources/mobile/mobile-operation.datasource";
import {
  CreateMobileTicketDto,
  ExitMobileTicketDto,
  MobileHistoryQueryDto,
  PensionPassAccessDto,
  TicketPaymentIntentDto,
} from "../../../domain/dtos/mobile/mobile-operation.dto";
import { ErrorService } from "../../services/error.service";
import type { MobileOperationService, PaymentIntent } from "../../services/mobile/mobile-operation.service";

type AuthenticatedRequest = Request & { uid?: string };
const userIdOf = (req: Request) => String((req as AuthenticatedRequest).uid ?? "").trim();

const serializeIntent = (intent: PaymentIntent) => ({
  id: intent.id, clientSecret: intent.client_secret, amount: intent.amount, currency: intent.currency, status: intent.status,
});

/** HTTP for the mobile app's operations; the rules live in MobileOperationService. */
export class MobileOperationController {
  constructor(private readonly mobile: MobileOperationService) {}

  createTicket = async (req: Request, res: Response) => {
    try {
      const [error, dto] = CreateMobileTicketDto.create(req.header("Idempotency-Key"), req.body);
      if (error || !dto) return res.status(400).json({ error });
      const { operation, replayed } = await this.mobile.createTicket(userIdOf(req), dto);
      return res.status(replayed && operation.status === "completed" ? 200 : 202).json({ operation });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  accessWithPensionPass = async (req: Request, res: Response) => {
    try {
      const [error, dto] = PensionPassAccessDto.create(req.header("Idempotency-Key"), req.params.id, req.body);
      if (error || !dto) return res.status(400).json({ error });
      return this.pensionAccessResponse(res, await this.mobile.accessWithPensionPass(userIdOf(req), dto));
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  /** OPERATIVO's answer to a barrier opening, as the app reads it. */
  private pensionAccessResponse(res: Response, operation: MobileOperationRecord) {
    const move = operation.result?.pensionMove as { tipo?: string } | undefined;
    if (operation.status === "completed" && move) {
      return res.status(200).json({
        operation, pensionMove: move,
        // After an entry the pass is inside the parking; after an exit, outside.
        pensionPass: { id: operation.payload?.pensionPassId, inParking: move.tipo === "ENTRADA" },
      });
    }
    if (operation.status === "failed") {
      // OPERATIVO's answer: anti-passback, schedule, expired pass...
      return res.status(409).json({ operation, error: operation.error || "No se pudo abrir la pluma", code: "PENSION_ACCESS_REJECTED" });
    }
    return res.status(503).json({ operation, error: "El estacionamiento no respondio; no se abrio la pluma", code: "PARKING_OFFLINE" });
  }

  getOperation = async (req: Request, res: Response) => {
    try {
      return res.status(200).json({ operation: await this.mobile.getOperation(userIdOf(req), String(req.params.operationId)) });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getCurrentTicket = async (req: Request, res: Response) => {
    try {
      const ticket = await this.mobile.currentTicket(userIdOf(req));
      if (!ticket) return res.status(204).send();
      return res.status(200).json({ ticket });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getTicketHistory = async (req: Request, res: Response) => {
    try {
      return res.status(200).json(await this.mobile.ticketHistory(userIdOf(req), MobileHistoryQueryDto.create(req.query as Record<string, unknown>)));
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getPaymentHistory = async (req: Request, res: Response) => {
    try {
      return res.status(200).json(await this.mobile.paymentHistory(userIdOf(req), MobileHistoryQueryDto.create(req.query as Record<string, unknown>)));
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getPaymentHistoryDetail = async (req: Request, res: Response) => {
    try {
      return res.status(200).json({ payment: await this.mobile.paymentDetail(userIdOf(req), String(req.params.paymentId)) });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  exitTicket = async (req: Request, res: Response) => {
    try {
      const [error, dto] = ExitMobileTicketDto.create(req.header("Idempotency-Key"), req.body);
      if (error || !dto) return res.status(400).json({ error });
      const operation = await this.mobile.exitTicket(userIdOf(req), dto);
      return res.status(operation.status === "completed" ? 200 : 503).json({
        operation,
        ticket: operation.result?.ticket,
        error: operation.status === "failed" ? operation.error : undefined,
      });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  createTicketPaymentIntent = async (req: Request, res: Response) => {
    try {
      const [error, dto] = TicketPaymentIntentDto.create(req.header("Idempotency-Key"), req.params.ticketId);
      if (error || !dto) return res.status(400).json({ error });
      const { intent, created } = await this.mobile.createTicketPaymentIntent(userIdOf(req), dto);
      return res.status(created ? 201 : 200).json({ paymentIntent: serializeIntent(intent) });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  confirmTicketPayment = async (req: Request, res: Response) => {
    try {
      const { payment, operation } = await this.mobile.confirmTicketPayment(
        userIdOf(req), String(req.params.ticketId ?? "").trim(), String(req.body?.paymentIntentId ?? "").trim(),
      );
      return res.status(operation.status === "completed" ? 200 : 202).json({
        payment: { id: payment.id, status: payment.status },
        operation,
        ticket: operation.result?.ticket,
      });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };
}
