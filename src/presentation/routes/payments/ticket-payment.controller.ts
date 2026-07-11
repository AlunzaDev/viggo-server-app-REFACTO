import { Request, Response } from "express";
import { ConfirmTicketPaymentDto } from "../../../domain/dtos/payments/confirm-ticket-payment.dto";
import { ErrorService } from "../../services/error.service";
import { TicketPaymentService } from "../../services/payments/ticket-payment.service";

export class TicketPaymentController {
  constructor(private readonly ticketPaymentService: TicketPaymentService) {}

  createPaymentIntent = async (req: Request, res: Response) => {
    try {
      const ticketId = String(req.params.ticketId);
      const paymentIntent =
        await this.ticketPaymentService.createPaymentIntent(ticketId);

      return res.status(201).json({ paymentIntent });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  confirmPayment = async (req: Request, res: Response) => {
    try {
      const ticketId = String(req.params.ticketId);
      const [error, confirmTicketPaymentDto] = ConfirmTicketPaymentDto.create(
        req.body,
      );
      if (error) return res.status(400).json({ error });

      const result = await this.ticketPaymentService.confirmTicketPayment(
        ticketId,
        confirmTicketPaymentDto!.paymentIntentId,
      );

      return res.status(200).json(result);
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };
}
