import { Router, type Request, type Response } from "express";
import { buildExternalPaymentService } from "../../dependencies/external-payments.dependencies";
import type { ExternalPaymentService } from "../../services/payments/external-payment.service";
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
  // The app sends the parking it detected; the provider comes from that parking.
  router.post("/orders", handle((req, uid) => service.resolve(uid, req.body?.projectId, req.body?.qr), 201));
  router.get("/orders/:id", handle((req, uid) => service.get(uid, String(req.params.id))));
  // Idempotent by canonical order ID: changing a client key cannot create a second charge.
  router.post("/orders/:id/payment-intent", handle((req, uid) => service.createPaymentIntent(uid, String(req.params.id)), 201));
  return router;
};
