import { Router, type Request, type Response } from "express";
import { AUTH_ROLES } from "../../../domain/constants";
import type { ExternalOrderRepository, ExternalOrderStatus } from "../../../domain/external-payments/external-payment";
import type { ExternalPaymentService } from "../../../domain/external-payments/external-payment.service";
import { CustomError } from "../../../domain/errors/custom.error";
import { AuthMiddleware } from "../../middlewares";
import { ErrorService } from "../../services/error.service";
import { buildPaginatedResponse, parsePaginationDateQuery } from "../../services/shared/pagination-query";
import { buildExternalOrderRepository, buildExternalPaymentService } from "../../dependencies/external-payments.dependencies";

const statuses = new Set(["quoted", "payment_pending", "paid", "confirmed", "confirmation_failed", "expired", "refunded"]);
const uuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const orderId = (req: Request) => {
  const id = String(req.params.id);
  if (!uuid(id)) throw CustomError.badRequest("Orden invalida");
  return id;
};

export const externalPaymentAdminRoutes = (
  service: ExternalPaymentService = buildExternalPaymentService(),
  orders: ExternalOrderRepository = buildExternalOrderRepository(),
) => {
  const router = Router();
  // External parking orders have no Viggo project scope. Restrict the global queue to SUPER_ROLE.
  router.use(AuthMiddleware.requireAuth, AuthMiddleware.requireApps("ADMIN_WEB"), AuthMiddleware.requireRoles(AUTH_ROLES.SUPER), AuthMiddleware.requireModules("payments"));
  const handle = (action: (req: Request) => Promise<unknown>, code = 200) => async (req: Request, res: Response) => {
    try { return res.status(code).json(await action(req)); }
    catch (error) { return ErrorService.handleApiError(error, res); }
  };
  router.get("/orders", handle(async req => {
    const { page, limit, from, to } = parsePaginationDateQuery(req.query);
    if ((from !== undefined && from > 8.64e15) || (to !== undefined && to > 8.64e15) || (from !== undefined && to !== undefined && from > to)) throw CustomError.badRequest("Rango de fechas invalido");
    const { status, provider, userId } = req.query;
    if (status !== undefined && (typeof status !== "string" || !statuses.has(status))) throw CustomError.badRequest("status invalido");
    if (provider !== undefined && (typeof provider !== "string" || !/^[a-z0-9_-]{1,64}$/.test(provider))) throw CustomError.badRequest("provider invalido");
    if (userId !== undefined && (typeof userId !== "string" || !uuid(userId))) throw CustomError.badRequest("userId invalido");
    const result = await orders.listAdmin({ status: status as ExternalOrderStatus | undefined, provider: provider as string | undefined, userId: userId as string | undefined, from, to }, page, limit);
    return buildPaginatedResponse("orders", result.orders, result.total, page, limit);
  }));
  router.get("/orders/:id/events", handle(async req => {
    const id = orderId(req);
    const { page, limit } = parsePaginationDateQuery(req.query);
    if (!await orders.find(id)) throw CustomError.notFound("Orden externa no encontrada");
    const result = await orders.events(id, page, limit);
    return buildPaginatedResponse("events", result.events, result.total, page, limit);
  }));
  router.post("/orders/:id/retry-confirmation", handle(async req => {
    await service.retryConfirmation(orderId(req), (req as Request & { uid: string }).uid, req.body?.reason);
    return { orderId: String(req.params.id), queued: true };
  }, 202));
  // Full refund of an order in review (asks the provider first); idempotent per order in Stripe.
  router.post("/orders/:id/refund", handle(async req =>
    service.refund(orderId(req), (req as Request & { uid: string }).uid, req.body?.reason)));
  // Did the provider apply it after all? Confirms the order if so; never sends or charges.
  router.post("/orders/:id/check-provider", handle(async req => {
    const id = orderId(req);
    return { orderId: id, ...await service.checkProvider(id, (req as Request & { uid: string }).uid) };
  }));
  return router;
};
