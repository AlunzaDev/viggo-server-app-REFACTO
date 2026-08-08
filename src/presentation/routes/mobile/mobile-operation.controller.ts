import { randomUUID } from "node:crypto";
import { Request, Response } from "express";
import { MobileOperationModel } from "../../../data/mongo";
import { LocalInstallationRequestModel } from "../../../data/mongo/models/system/local-installation-request.schema";
import { ModuloModel } from "../../../data/mongo/models/parking/modulo.schema";
import { ErrorService } from "../../services/error.service";
import { StripePlugin } from "../../../config/plugins/stripe.plugin";
import { envs } from "../../../config";
import { PaymentModel } from "../../../data/mongo";
import { UsuarioModel } from "../../../data/mongo/models/auth/usuario.schema";

type AuthenticatedRequest = Request & { uid?: string };

const decodeModuleId = (moduleToken: string) => {
  try {
    const payload = moduleToken.split(".")[1];
    if (!payload) return "";
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
    return String(decoded.id ?? decoded.moduloId ?? "").trim();
  } catch {
    return "";
  }
};

export class MobileOperationController {
  createTicket = async (req: Request, res: Response) => {
    try {
      const userId = String((req as AuthenticatedRequest).uid ?? "").trim();
      const idempotencyKey = String(req.header("Idempotency-Key") ?? "").trim();
      const moduleToken = String(req.body?.moduleToken ?? "").trim();
      if (!/^[A-Za-z0-9._:-]{16,128}$/.test(idempotencyKey)) {
        return res.status(400).json({ error: "Idempotency-Key invalida" });
      }
      if (!moduleToken) return res.status(400).json({ error: "moduleToken es requerido" });

      const existing = await MobileOperationModel.findOne({ idempotencyKey }).lean();
      if (existing) {
        if (String(existing.userId) !== userId || existing.type !== "CREATE_TICKET") {
          return res.status(409).json({ error: "La clave ya fue usada para otra operacion" });
        }
        return res.status(existing.status === "completed" ? 200 : 202).json({ operation: existing });
      }

      const moduloId = decodeModuleId(moduleToken);
      const modulo = moduloId ? await ModuloModel.findById(moduloId).lean() : null;
      if (!modulo) return res.status(400).json({ error: "El QR no identifica un modulo valido" });
      const proyectoId = String(modulo.proyecto ?? "");
      const installation = await LocalInstallationRequestModel.findOne({
        proyectoId,
        status: "approved",
      }).lean();
      if (!installation) {
        return res.status(503).json({ error: "El estacionamiento no esta disponible para operaciones moviles" });
      }

      const now = Date.now();
      if (now - Number(installation.lastCommandPollAt ?? 0) > 10_000) {
        return res.status(503).json({ error: "El estacionamiento esta desconectado; no se genero el ticket" });
      }
      const operation = await MobileOperationModel.create({
        operationId: randomUUID(),
        idempotencyKey,
        type: "CREATE_TICKET",
        installationId: installation.installationId,
        proyectoId,
        userId,
        payload: { moduleToken },
        status: "pending",
        attempts: 0,
        maxAttempts: 3,
        nextRetryAt: now,
        createdAt: now,
        expiresAt: now + 30_000,
        updatedAt: now,
      });
      return res.status(202).json({ operation: operation.toObject() });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        const existing = await MobileOperationModel.findOne({
          idempotencyKey: String(req.header("Idempotency-Key") ?? "").trim(),
        }).lean();
        return res.status(202).json({ operation: existing });
      }
      return ErrorService.handleApiError(error, res);
    }
  };

  getOperation = async (req: Request, res: Response) => {
    try {
      const userId = String((req as AuthenticatedRequest).uid ?? "").trim();
      const operation = await MobileOperationModel.findOne({
        operationId: String(req.params.operationId),
        userId,
      }).lean();
      if (!operation) return res.status(404).json({ error: "Operacion no encontrada" });
      return res.status(200).json({ operation });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getCurrentTicket = async (req: Request, res: Response) => {
    try {
      const userId = String((req as AuthenticatedRequest).uid ?? "");
      const operation = await MobileOperationModel.findOne({
        userId,
        status: "completed",
        "result.ticket": { $exists: true },
      }).sort({ completedAt: -1 }).lean();
      const ticket = (operation?.result as Record<string, unknown> | undefined)?.ticket;
      if (!ticket) return res.status(204).send();
      return res.status(200).json({ ticket });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getTicketHistory = async (req: Request, res: Response) => {
    try {
      const userId = String((req as AuthenticatedRequest).uid ?? "");
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10));
      const from = Number(req.query.from);
      const to = Number(req.query.to);
      const operations = await MobileOperationModel.find({
        userId,
        status: "completed",
        "result.ticket": { $exists: true },
        ...(Number.isFinite(from) || Number.isFinite(to)
          ? { completedAt: {
              ...(Number.isFinite(from) ? { $gte: from } : {}),
              ...(Number.isFinite(to) ? { $lte: to } : {}),
            } }
          : {}),
      }).sort({ completedAt: -1 }).lean();
      const unique = new Map<string, unknown>();
      for (const operation of operations) {
        const ticket = (operation.result as Record<string, any> | undefined)?.ticket;
        const ticketId = String(ticket?.uid ?? ticket?.id ?? "");
        if (ticketId && !unique.has(ticketId)) unique.set(ticketId, ticket);
      }
      const tickets = [...unique.values()];
      const total = tickets.length;
      return res.status(200).json({
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        tickets: tickets.slice((page - 1) * limit, page * limit),
      });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getPaymentHistory = async (req: Request, res: Response) => {
    try {
      const userId = String((req as AuthenticatedRequest).uid ?? "");
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10));
      const from = Number(req.query.from);
      const to = Number(req.query.to);
      const filter = {
        user: userId,
        ...(Number.isFinite(from) || Number.isFinite(to)
          ? { paidAt: {
              ...(Number.isFinite(from) ? { $gte: from } : {}),
              ...(Number.isFinite(to) ? { $lte: to } : {}),
            } }
          : {}),
      };
      const [total, documents] = await Promise.all([
        PaymentModel.countDocuments(filter),
        PaymentModel.find(filter).sort({ paidAt: -1 }).skip((page - 1) * limit).limit(limit),
      ]);
      return res.status(200).json({
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        payments: documents.map((document) => document.toJSON()),
      });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getPaymentHistoryDetail = async (req: Request, res: Response) => {
    try {
      const userId = String((req as AuthenticatedRequest).uid ?? "");
      const payment = await PaymentModel.findOne({ _id: String(req.params.paymentId), user: userId });
      if (!payment) return res.status(404).json({ error: "Pago no encontrado" });
      return res.status(200).json({ payment: payment.toJSON() });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  exitTicket = async (req: Request, res: Response) => {
    try {
      const userId = String((req as AuthenticatedRequest).uid ?? "");
      const key = String(req.header("Idempotency-Key") ?? "").trim();
      const moduleToken = String(req.body?.moduleToken ?? "").trim();
      if (!/^[A-Za-z0-9._:-]{16,128}$/.test(key) || !moduleToken) {
        return res.status(400).json({ error: "Idempotency-Key y moduleToken son requeridos" });
      }
      const source = await MobileOperationModel.findOne({
        userId,
        status: "completed",
        type: { $in: ["CREATE_TICKET", "APPLY_TICKET_PAYMENT"] },
        "result.ticket": { $exists: true },
      }).sort({ completedAt: -1 }).lean();
      if (!source) return res.status(404).json({ error: "Ticket activo no encontrado" });
      const operation = await this.enqueueAndWait({
        idempotencyKey: key,
        type: "EXIT_TICKET",
        installationId: String(source.installationId),
        proyectoId: String(source.proyectoId),
        userId,
        payload: { moduleToken },
      });
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
      const userId = String((req as AuthenticatedRequest).uid ?? "");
      const ticketId = String(req.params.ticketId ?? "").trim();
      const key = String(req.header("Idempotency-Key") ?? "").trim();
      if (!/^[A-Za-z0-9._:-]{16,128}$/.test(key)) {
        return res.status(400).json({ error: "Idempotency-Key invalida" });
      }
      const existingPayment = await PaymentModel.findOne({ idempotencyKey: key }).lean();
      if (existingPayment) {
        const saved = existingPayment as unknown as Record<string, any>;
        if (String(saved.user) !== userId || String(saved.reference?.id) !== ticketId) {
          return res.status(409).json({ error: "La clave ya fue usada para otro pago" });
        }
        const intent = envs.STRIPE_MOCK_ENABLED || !envs.STRIPE_ENABLED
          ? { id: String(saved.stripePaymentIntentId), client_secret: `pi_mock_${saved.stripePaymentIntentId}_secret_mock`, amount: Math.round(Number(saved.amount) * 100), currency: String(saved.currency).toLowerCase(), status: "requires_payment_method" }
          : await StripePlugin.client.paymentIntents.retrieve(String(saved.stripePaymentIntentId));
        return res.status(200).json({ paymentIntent: this.serializeIntent(intent) });
      }

      const source = await MobileOperationModel.findOne({
        userId,
        type: "CREATE_TICKET",
        status: "completed",
        "result.ticket.uid": ticketId,
      }).sort({ completedAt: -1 }).lean();
      if (!source) return res.status(404).json({ error: "Ticket movil no encontrado" });

      const quote = await this.enqueueAndWait({
        idempotencyKey: `${key}:quote`,
        type: "QUOTE_TICKET",
        installationId: String(source.installationId),
        proyectoId: String(source.proyectoId),
        userId,
        payload: { ticketId },
      });
      if (quote.status !== "completed") {
        return res.status(503).json({ error: quote.error || "El parking no respondio la cotizacion" });
      }
      const amount = Number((quote.result as Record<string, unknown>)?.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(409).json({ error: "La cotizacion local no es valida" });
      }

      const user = await UsuarioModel.findById(userId).lean();
      if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
      let intent: { id: string; client_secret: string | null; amount: number; currency: string; status: string };
      if (envs.STRIPE_MOCK_ENABLED || !envs.STRIPE_ENABLED) {
        const id = `mock_${randomUUID()}`;
        intent = { id, client_secret: `pi_mock_${id}_secret_mock`, amount: Math.round(amount * 100), currency: envs.STRIPE_CURRENCY.toLowerCase(), status: "requires_payment_method" };
      } else {
        intent = await StripePlugin.client.paymentIntents.create({
          amount: Math.round(amount * 100),
          currency: envs.STRIPE_CURRENCY,
          receipt_email: String(user.correo),
          automatic_payment_methods: { enabled: true },
          metadata: { type: "ticket", ticketId, userId, proyectoId: String(source.proyectoId) },
        }, { idempotencyKey: key });
      }
      await PaymentModel.create({
        user: userId,
        type: "ticket",
        concept: "Pago de ticket desde Viggo App",
        amount,
        currency: envs.STRIPE_CURRENCY,
        status: "pending",
        paidAt: Date.now(),
        stripePaymentIntentId: intent.id,
        idempotencyKey: key,
        reference: { type: "ticket", id: ticketId },
        parking: { id: String(source.proyectoId) },
        rawProviderStatus: intent.status,
      });
      return res.status(201).json({ paymentIntent: this.serializeIntent(intent) });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  confirmTicketPayment = async (req: Request, res: Response) => {
    try {
      const userId = String((req as AuthenticatedRequest).uid ?? "");
      const ticketId = String(req.params.ticketId ?? "").trim();
      const paymentIntentId = String(req.body?.paymentIntentId ?? "").trim();
      const payment = await PaymentModel.findOne({ user: userId, stripePaymentIntentId: paymentIntentId, "reference.id": ticketId });
      if (!payment) return res.status(404).json({ error: "Pago no encontrado" });
      const providerStatus = envs.STRIPE_MOCK_ENABLED || !envs.STRIPE_ENABLED
        ? "succeeded"
        : (await StripePlugin.client.paymentIntents.retrieve(paymentIntentId)).status;
      if (providerStatus !== "succeeded") {
        return res.status(409).json({ error: "Stripe aun no confirma el pago", providerStatus });
      }
      payment.status = "succeeded";
      payment.rawProviderStatus = providerStatus;
      payment.paidAt = Date.now();
      await payment.save();

      const source = await MobileOperationModel.findOne({ userId, type: "CREATE_TICKET", "result.ticket.uid": ticketId }).sort({ createdAt: -1 }).lean();
      if (!source) return res.status(409).json({ error: "No se encontro el parking del ticket" });
      const apply = await this.enqueueAndWait({
        idempotencyKey: `apply:${paymentIntentId}`,
        type: "APPLY_TICKET_PAYMENT",
        installationId: String(source.installationId),
        proyectoId: String(source.proyectoId),
        userId,
        payload: {
          ticketId,
          providerReference: paymentIntentId,
          amount: payment.amount,
          currency: payment.currency,
          paidAt: payment.paidAt,
        },
      });
      return res.status(apply.status === "completed" ? 200 : 202).json({
        payment: { id: String(payment._id), status: payment.status },
        operation: apply,
        ticket: (apply.result as Record<string, unknown> | undefined)?.ticket,
      });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  private serializeIntent(intent: { id: string; client_secret: string | null; amount: number; currency: string; status: string }) {
    return { id: intent.id, clientSecret: intent.client_secret, amount: intent.amount, currency: intent.currency, status: intent.status };
  }

  private async enqueueAndWait(input: { idempotencyKey: string; type: string; installationId: string; proyectoId: string; userId: string; payload: Record<string, unknown> }): Promise<any> {
    let operation: any = await MobileOperationModel.findOne({ idempotencyKey: input.idempotencyKey }).lean();
    if (!operation) {
      const now = Date.now();
      const expiresAt = input.type === "APPLY_TICKET_PAYMENT" ? undefined : now + 30_000;
      const maxAttempts = input.type === "APPLY_TICKET_PAYMENT" ? 12 : 3;
      operation = (await MobileOperationModel.create({ operationId: randomUUID(), ...input, status: "pending", attempts: 0, maxAttempts, nextRetryAt: now, createdAt: now, expiresAt, updatedAt: now })).toObject();
    }
    for (let attempt = 0; attempt < 30 && !["completed", "failed"].includes(String(operation.status)); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      operation = await MobileOperationModel.findOne({ operationId: operation.operationId }).lean() ?? operation;
    }
    return operation;
  }
}
