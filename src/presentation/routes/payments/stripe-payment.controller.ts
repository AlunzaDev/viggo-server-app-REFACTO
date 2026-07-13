import { Request, Response } from "express";
import { ErrorService } from "../../services/error.service";
import { StripePaymentService } from "../../services/payments/stripe-payment.service";

export class StripePaymentController {
  constructor(private readonly stripePaymentService: StripePaymentService) {}

  createPaymentIntent = async (req: Request, res: Response) => {
    try {
      const authRequest = req as Request & { uid?: string };
      const usuarioId = authRequest.uid;
      const monto = Number(req.query.monto);

      if (!usuarioId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const response = await this.stripePaymentService.createPaymentIntent(
        usuarioId,
        monto,
      );

      return res.status(200).json(response);
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };
}
