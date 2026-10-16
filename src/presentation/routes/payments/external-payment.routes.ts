import { Router, type Request, type Response } from "express";
import { buildExternalPaymentService } from "../../dependencies/external-payments.dependencies";
import type { ExternalPaymentService } from "../../../domain/external-payments/external-payment.service";
import { ErrorService } from "../../services/error.service";

/** Parent router must require authentication and OPERATIVE_MOBILE. */
export const externalPaymentRoutes = (service: ExternalPaymentService = buildExternalPaymentService()) => {
  const router = Router();
  const handle = (action: (req: Request, userId: string) => Promise<unknown>, status = 200) =>
    async (req: Request, res: Response) => {
      try {
        const userId = (req as Request & { uid?: string }).uid;
        if (!userId) return res.status(401).json({ error: "Unauthorized" });
        return res.status(status).json(await action(req, userId));
      } catch (error) { return ErrorService.handleApiError(error, res); }
    };
  router.post("/orders", handle((req, uid) => service.resolve(uid, String(req.body?.provider ?? ""), req.body?.qr), 201));
  router.get("/orders/:id", handle((req, uid) => service.get(uid, String(req.params.id))));
  // Idempotent by canonical order ID: changing a client key cannot create a second charge.
  router.post("/orders/:id/payment-intent", handle((req, uid) => service.createPaymentIntent(uid, String(req.params.id)), 201));
  return router;
};
