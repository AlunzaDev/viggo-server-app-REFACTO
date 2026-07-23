import { Request, Response } from "express";
import { ErrorService } from "../../services/error.service";
import { StripePaymentService } from "../../services/payments/stripe-payment.service";

type AuthenticatedRequest = Request & { uid?: string };

export class StripePaymentController {
  constructor(private readonly stripePaymentService: StripePaymentService) {}

  createPaymentIntent = async (req: Request, res: Response) => {
    try {
      const usuarioId = (req as AuthenticatedRequest).uid;
      const monto = Number((req.body as { monto?: unknown }).monto);
      if (!usuarioId) return res.status(401).json({ error: "Unauthorized" });

      const response = await this.stripePaymentService.createPaymentIntent(usuarioId, monto);
      return res.status(201).json(response);
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };
}
