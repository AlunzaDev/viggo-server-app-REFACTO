import { Request, Response } from "express";
import { ErrorService } from "../../services/error.service";
import { PaymentHistoryService } from "../../services/payments/payment-history.service";

type AuthenticatedRequest = Request & { uid?: string };

export class PaymentHistoryController {
  constructor(private readonly paymentHistoryService: PaymentHistoryService) {}

  getHistory = async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthenticatedRequest).uid;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const response = await this.paymentHistoryService.getHistory(
        userId,
        req.query,
      );

      return res.status(200).json(response);
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getPaymentDetail = async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthenticatedRequest).uid;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const payment = await this.paymentHistoryService.getPaymentDetail(
        userId,
        String(req.params.paymentId),
      );

      return res.status(200).json({ payment });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };
}
