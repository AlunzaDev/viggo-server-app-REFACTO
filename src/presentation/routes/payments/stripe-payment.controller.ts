import { Request, Response } from "express";
import { ErrorService } from "../../services/error.service";
import { StripePaymentService } from "../../services/payments/stripe-payment.service";

type AuthenticatedRequest = Request & { uid?: string };

export class StripePaymentController {
  constructor(private readonly stripePaymentService: StripePaymentService) {}

  createPaymentIntent = async (req: Request, res: Response) => {
    try {
      const usuarioId = (req as AuthenticatedRequest).uid;
      const body = req.body as Record<string, unknown>;
      if (!usuarioId) return res.status(401).json({ error: "Unauthorized" });
      const idempotencyKey = String(req.header("Idempotency-Key") ?? "").trim();
      if (!/^[A-Za-z0-9._:-]{16,128}$/.test(idempotencyKey)) {
        return res.status(400).json({ error: "Idempotency-Key invalida" });
      }

      const operation = String(body.operation ?? "") as "contract" | "renew";
      const response = await this.stripePaymentService.createPaymentIntent(usuarioId, {
        pensionPassId: String(body.pensionPassId ?? ""),
        operation,
        contractMonths: Number(body.contractMonths ?? 1),
      }, idempotencyKey);
      return res.status(201).json(response);
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };
}
