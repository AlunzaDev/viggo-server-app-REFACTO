import { randomUUID } from "node:crypto";
import { Request, Response } from "express";
import { ErrorService } from "../../services/error.service";
import { StripePlugin } from "../../../config/plugins/stripe.plugin";
import { envs } from "../../../config";
import { UniqueConstraintError } from "../../../domain/errors/unique-constraint.error";
import type { MobileOperationRecord } from "../../../domain/datasources/mobile/mobile-operation.datasource";
import type { MobileOperationRepository } from "../../../domain/repositories/mobile/mobile-operation.repository";
import type { PaymentRepository } from "../../../domain/repositories/payments/payment.repository";
import type { ModuloRepository } from "../../../domain/repositories/parking/modulo.repository";
import type { InstallationsRepository } from "../../../domain/repositories/installations/installations.repository";
import type { UsuarioRepository } from "../../../domain/repositories/auth/usuario.repository";
import type { PensionPassRepository } from "../../../domain/repositories/pension/pension-pass.repository";
import type { PensionRepository } from "../../../domain/repositories/pension/pension.repository";

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

const finiteOrUndefined = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
};

export class MobileOperationController {
  constructor(
    private readonly operations: MobileOperationRepository,
    private readonly payments: PaymentRepository,
    private readonly modulos: ModuloRepository,
    private readonly installations: InstallationsRepository,
    private readonly usuarios: UsuarioRepository,
    private readonly pensionPasses?: PensionPassRepository,
    private readonly pensions?: PensionRepository,
  ) {}

  createTicket = async (req: Request, res: Response) => {
    try {
      const userId = String((req as AuthenticatedRequest).uid ?? "").trim();
      const idempotencyKey = String(req.header("Idempotency-Key") ?? "").trim();
      const moduleToken = String(req.body?.moduleToken ?? "").trim();
      const requestedProjectId = String(req.body?.projectId ?? "").trim();
      if (!/^[A-Za-z0-9._:-]{16,128}$/.test(idempotencyKey)) {
        return res.status(400).json({ error: "Idempotency-Key invalida" });
      }
      if (!moduleToken) return res.status(400).json({ error: "moduleToken es requerido" });
      if (!requestedProjectId) return res.status(400).json({ error: "projectId es requerido" });

      const existing = await this.operations.findByIdempotencyKey(idempotencyKey);
      if (existing) {
        if (String(existing.userId) !== userId || existing.type !== "CREATE_TICKET") {
          return res.status(409).json({ error: "La clave ya fue usada para otra operacion" });
        }
        return res.status(existing.status === "completed" ? 200 : 202).json({ operation: existing });
      }

      const moduloId = decodeModuleId(moduleToken);
      const modulo = moduloId ? await this.modulos.findById(moduloId) : null;
      if (!modulo) return res.status(400).json({ error: "El QR no identifica un modulo valido" });
      const proyectoId = String(modulo.proyecto ?? "");
      if (proyectoId !== requestedProjectId || modulo.tipo !== "ENTRADA") {
        return res.status(409).json({
          error: "El QR de entrada no pertenece al estacionamiento detectado",
          code: "PARKING_QR_MISMATCH",
        });
      }
      const installation = await this.installations.findApprovedByProyectoId(proyectoId);
      if (!installation) {
        return res.status(503).json({ error: "El estacionamiento no esta disponible para operaciones moviles" });
      }

      const now = Date.now();
      if (now - Number(installation.lastCommandPollAt ?? 0) > 10_000) {
        return res.status(503).json({ error: "El estacionamiento esta desconectado; no se genero el ticket" });
      }
      const operation = await this.operations.create({
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
      return res.status(202).json({ operation });
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        const existing = await this.operations.findByIdempotencyKey(
          String(req.header("Idempotency-Key") ?? "").trim(),
        );
        return res.status(202).json({ operation: existing });
      }
      return ErrorService.handleApiError(error, res);
    }
  };

  /**
   * Opens the barrier of the scanned module with the user's Pension Pass. The project comes from
   * the module, never from the client; OPERATIVO applies schedule and anti-passback and opens it.
   */
  accessWithPensionPass = async (req: Request, res: Response) => {
    try {
      const userId = String((req as AuthenticatedRequest).uid ?? "").trim();
      const key = String(req.header("Idempotency-Key") ?? "").trim();
      const pensionPassId = String(req.params.id ?? "").trim();
      const moduleToken = String(req.body?.moduleToken ?? "").trim();
      const requestedProjectId = String(req.body?.projectId ?? "").trim();
      if (!/^[A-Za-z0-9._:-]{16,128}$/.test(key)) return res.status(400).json({ error: "Idempotency-Key invalida" });
      if (!moduleToken || !requestedProjectId) return res.status(400).json({ error: "projectId y moduleToken son requeridos" });

      // Same key: the same answer (never a second barrier opening).
      const existing = await this.operations.findByIdempotencyKey(key);
      if (existing) {
        if (String(existing.userId) !== userId || existing.type !== "PENSION_PASS_ACCESS" || existing.payload?.pensionPassId !== pensionPassId) {
          return res.status(409).json({ error: "La clave ya fue usada para otra operacion" });
        }
        return this.pensionAccessResponse(res, existing);
      }

      const pass = this.pensionPasses ? await this.pensionPasses.findById(pensionPassId) : null;
      if (!pass || pass.usuario !== userId) return res.status(404).json({ error: "PensionPass no encontrado" });
      if (!pass.estado || !pass.vigent || (pass.to !== -1 && pass.to < Date.now())) {
        return res.status(409).json({ error: "La pension no esta vigente", code: "PENSION_PASS_NOT_VALID" });
      }
      const pension = this.pensions ? await this.pensions.findById(pass.pension) : null;
      const moduloId = decodeModuleId(moduleToken);
      const modulo = moduloId ? await this.modulos.findById(moduloId) : null;
      if (!modulo || !["ENTRADA", "SALIDA"].includes(String(modulo.tipo))) {
        return res.status(400).json({ error: "El QR no identifica una entrada o salida" });
      }
      const proyectoId = String(modulo.proyecto ?? "");
      if (proyectoId !== requestedProjectId || !pension || pension.proyecto !== proyectoId) {
        return res.status(409).json({ error: "El QR no pertenece al estacionamiento de la pension", code: "PARKING_QR_MISMATCH" });
      }

      const installation = await this.installations.findApprovedByProyectoId(proyectoId);
      if (!installation || Date.now() - Number(installation.lastCommandPollAt ?? 0) > 10_000) {
        return res.status(503).json({ error: "El estacionamiento esta desconectado; no se abrio la pluma", code: "PARKING_OFFLINE" });
      }
      const operation = await this.enqueueAndWait({
        idempotencyKey: key,
        type: "PENSION_PASS_ACCESS",
        installationId: installation.installationId,
        proyectoId,
        userId,
        payload: { pensionPassId, moduleToken },
      });
      return this.pensionAccessResponse(res, operation);
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        const existing = await this.operations.findByIdempotencyKey(String(req.header("Idempotency-Key") ?? "").trim());
        if (existing) return this.pensionAccessResponse(res, existing);
      }
      return ErrorService.handleApiError(error, res);
    }
  };

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
      const userId = String((req as AuthenticatedRequest).uid ?? "").trim();
      const operation = await this.operations.findByOperationId(String(req.params.operationId), userId);
      if (!operation) return res.status(404).json({ error: "Operacion no encontrada" });
      return res.status(200).json({ operation });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getCurrentTicket = async (req: Request, res: Response) => {
    try {
      const userId = String((req as AuthenticatedRequest).uid ?? "");
      const operation = await this.operations.findLatestCompletedWithTicket(userId);
      const ticket = operation?.result?.ticket;
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
      const operations = await this.operations.findCompletedWithTicket(userId, {
        from: finiteOrUndefined(req.query.from),
        to: finiteOrUndefined(req.query.to),
      });
      const unique = new Map<string, unknown>();
      for (const operation of operations) {
        const ticket = operation.result?.ticket;
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
      const { total, payments } = await this.payments.getSerializedByUser(userId, {
        page,
        limit,
        from: finiteOrUndefined(req.query.from),
        to: finiteOrUndefined(req.query.to),
      });
      return res.status(200).json({
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        payments,
      });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getPaymentHistoryDetail = async (req: Request, res: Response) => {
    try {
      const userId = String((req as AuthenticatedRequest).uid ?? "");
      const payment = await this.payments.findSerializedByIdForUser(String(req.params.paymentId), userId);
      if (!payment) return res.status(404).json({ error: "Pago no encontrado" });
      return res.status(200).json({ payment });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  exitTicket = async (req: Request, res: Response) => {
    try {
      const userId = String((req as AuthenticatedRequest).uid ?? "");
      const key = String(req.header("Idempotency-Key") ?? "").trim();
      const moduleToken = String(req.body?.moduleToken ?? "").trim();
      const requestedProjectId = String(req.body?.projectId ?? "").trim();
      if (!/^[A-Za-z0-9._:-]{16,128}$/.test(key) || !moduleToken || !requestedProjectId) {
        return res.status(400).json({ error: "Idempotency-Key, projectId y moduleToken son requeridos" });
      }
      const moduloId = decodeModuleId(moduleToken);
      const modulo = moduloId ? await this.modulos.findById(moduloId) : null;
      if (!modulo || modulo.tipo !== "SALIDA" || String(modulo.proyecto ?? "") !== requestedProjectId) {
        return res.status(409).json({
          error: "El QR de salida no pertenece al estacionamiento detectado",
          code: "PARKING_QR_MISMATCH",
        });
      }
      const source = await this.operations.findLatestCompletedWithTicket(userId, [
        "CREATE_TICKET",
        "APPLY_TICKET_PAYMENT",
      ]);
      if (!source) return res.status(404).json({ error: "Ticket activo no encontrado" });
      if (String(source.proyectoId) !== requestedProjectId) {
        return res.status(409).json({
          error: "El ticket activo pertenece a otro estacionamiento",
          code: "PARKING_TICKET_MISMATCH",
        });
      }
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
      const saved = await this.payments.findRecordByIdempotencyKey(key);
      if (saved) {
        if (String(saved.user) !== userId || String(saved.reference?.id) !== ticketId) {
          return res.status(409).json({ error: "La clave ya fue usada para otro pago" });
        }
        const intent = envs.STRIPE_MOCK_ENABLED || !envs.STRIPE_ENABLED
          ? { id: String(saved.stripePaymentIntentId), client_secret: `pi_mock_${saved.stripePaymentIntentId}_secret_mock`, amount: Math.round(Number(saved.amount) * 100), currency: String(saved.currency).toLowerCase(), status: "requires_payment_method" }
          : await StripePlugin.client.paymentIntents.retrieve(String(saved.stripePaymentIntentId));
        return res.status(200).json({ paymentIntent: this.serializeIntent(intent) });
      }

      const source = await this.operations.findCompletedTicketSource(userId, ticketId);
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
      const amount = Number(quote.result?.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(409).json({ error: "La cotizacion local no es valida" });
      }

      const user = await this.usuarios.findById(userId);
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
      await this.payments.createRecord({
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
      const pending = await this.payments.findRecordForUser({
        userId,
        stripePaymentIntentId: paymentIntentId,
        referenceId: ticketId,
      });
      if (!pending) return res.status(404).json({ error: "Pago no encontrado" });
      const providerStatus = envs.STRIPE_MOCK_ENABLED || !envs.STRIPE_ENABLED
        ? "succeeded"
        : (await StripePlugin.client.paymentIntents.retrieve(paymentIntentId)).status;
      if (providerStatus !== "succeeded") {
        return res.status(409).json({ error: "Stripe aun no confirma el pago", providerStatus });
      }
      const payment = await this.payments.markSucceeded(pending.id, {
        rawProviderStatus: providerStatus,
        paidAt: Date.now(),
      });
      if (!payment) return res.status(404).json({ error: "Pago no encontrado" });

      const source = await this.operations.findLatestTicketSource(userId, ticketId);
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
        payment: { id: payment.id, status: payment.status },
        operation: apply,
        ticket: apply.result?.ticket,
      });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  private serializeIntent(intent: { id: string; client_secret: string | null; amount: number; currency: string; status: string }) {
    return { id: intent.id, clientSecret: intent.client_secret, amount: intent.amount, currency: intent.currency, status: intent.status };
  }

  private async enqueueAndWait(input: { idempotencyKey: string; type: string; installationId: string; proyectoId: string; userId: string; payload: Record<string, unknown> }): Promise<MobileOperationRecord> {
    let operation = await this.operations.findByIdempotencyKey(input.idempotencyKey);
    if (!operation) {
      const now = Date.now();
      // Opening a barrier late, once the user left, is worse than not opening it: short life.
      const expiresAt = input.type === "APPLY_TICKET_PAYMENT" ? undefined : now + (input.type === "PENSION_PASS_ACCESS" ? 15_000 : 30_000);
      // A rejected barrier opening is final: the app already showed the error to the user.
      const maxAttempts = input.type === "APPLY_TICKET_PAYMENT" ? 12 : input.type === "PENSION_PASS_ACCESS" ? 1 : 3;
      operation = await this.operations.create({ operationId: randomUUID(), ...input, status: "pending", attempts: 0, maxAttempts, nextRetryAt: now, createdAt: now, expiresAt, updatedAt: now });
    }
    for (let attempt = 0; attempt < 30 && !["completed", "failed"].includes(String(operation.status)); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      operation = await this.operations.findByOperationId(operation.operationId) ?? operation;
    }
    return operation;
  }
}
