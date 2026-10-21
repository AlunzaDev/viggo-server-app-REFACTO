import { randomUUID } from "node:crypto";
import { envs } from "../../../config";
import { StripePlugin } from "../../../config/plugins/stripe.plugin";
import type { MobileOperationRecord } from "../../../domain/datasources/mobile/mobile-operation.datasource";
import type {
  CreateMobileTicketDto,
  ExitMobileTicketDto,
  MobileHistoryQueryDto,
  PensionPassAccessDto,
  TicketPaymentIntentDto,
} from "../../../domain/dtos/mobile/mobile-operation.dto";
import { CustomError } from "../../../domain/errors/custom.error";
import { UniqueConstraintError } from "../../../domain/errors/unique-constraint.error";
import type { InstallationsRepository } from "../../../domain/repositories/installations/installations.repository";
import type { MobileOperationRepository } from "../../../domain/repositories/mobile/mobile-operation.repository";
import type { ModuloRepository } from "../../../domain/repositories/parking/modulo.repository";
import type { PaymentRepository } from "../../../domain/repositories/payments/payment.repository";
import type { PensionPassRepository } from "../../../domain/repositories/pension/pension-pass.repository";
import type { PensionRepository } from "../../../domain/repositories/pension/pension.repository";
import type { UsuarioRepository } from "../../../domain/repositories/auth/usuario.repository";

/** A parking whose OPERATIVO has not asked for commands in this long is offline. */
const ONLINE_WINDOW_MS = 10_000;
/** How long a request waits for OPERATIVO to answer its command (30 × 500 ms). */
const WAIT_ATTEMPTS = 30;
const WAIT_STEP_MS = 500;

type OperationInput = { idempotencyKey: string; type: string; installationId: string; proyectoId: string; userId: string; payload: Record<string, unknown> };
export type PaymentIntent = { id: string; client_secret: string | null; amount: number; currency: string; status: string };

/** The module id inside a module QR (OPERATIVO verifies its signature; the cloud only routes it). */
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

const page = <T>(items: T[] | { total: number; items: T[] }, query: MobileHistoryQueryDto) => {
  const total = Array.isArray(items) ? items.length : items.total;
  return { total, page: query.page, limit: query.limit, totalPages: Math.max(1, Math.ceil(total / query.limit)) };
};

const stripeMocked = () => envs.STRIPE_MOCK_ENABLED || !envs.STRIPE_ENABLED;

/**
 * What the mobile app asks a parking to do (enter, pay, exit, open with a Pension Pass). Each
 * request becomes a command that the parking's OPERATIVO takes and answers (docs: #12).
 */
export class MobileOperationService {
  constructor(
    private readonly operations: MobileOperationRepository,
    private readonly payments: PaymentRepository,
    private readonly modulos: ModuloRepository,
    private readonly installations: InstallationsRepository,
    private readonly usuarios: UsuarioRepository,
    private readonly pensionPasses?: PensionPassRepository,
    private readonly pensions?: PensionRepository,
  ) {}

  /** Queues the ticket for OPERATIVO. `replayed`: the key was already used by this request. */
  async createTicket(userId: string, dto: CreateMobileTicketDto): Promise<{ operation: MobileOperationRecord; replayed: boolean }> {
    try {
      const existing = await this.operations.findByIdempotencyKey(dto.idempotencyKey);
      if (existing) {
        if (String(existing.userId) !== userId || existing.type !== "CREATE_TICKET") throw CustomError.conflict("La clave ya fue usada para otra operacion");
        return { operation: existing, replayed: true };
      }

      const moduloId = decodeModuleId(dto.moduleToken);
      const modulo = moduloId ? await this.modulos.findById(moduloId) : null;
      if (!modulo) throw CustomError.badRequest("El QR no identifica un modulo valido");
      const proyectoId = String(modulo.proyecto ?? "");
      if (proyectoId !== dto.projectId || modulo.tipo !== "ENTRADA") {
        throw CustomError.conflict("El QR de entrada no pertenece al estacionamiento detectado", undefined, "PARKING_QR_MISMATCH");
      }
      const installation = await this.installations.findApprovedByProyectoId(proyectoId);
      if (!installation) throw CustomError.serviceUnavailable("El estacionamiento no esta disponible para operaciones moviles");

      const now = Date.now();
      if (now - Number(installation.lastCommandPollAt ?? 0) > ONLINE_WINDOW_MS) {
        throw CustomError.serviceUnavailable("El estacionamiento esta desconectado; no se genero el ticket");
      }
      const operation = await this.operations.create({
        operationId: randomUUID(),
        idempotencyKey: dto.idempotencyKey,
        type: "CREATE_TICKET",
        installationId: installation.installationId,
        proyectoId,
        userId,
        payload: { moduleToken: dto.moduleToken },
        status: "pending",
        attempts: 0,
        maxAttempts: 3,
        nextRetryAt: now,
        createdAt: now,
        expiresAt: now + 30_000,
        updatedAt: now,
      });
      return { operation, replayed: false };
    } catch (error) {
      // Two requests with the same key at once: the one that lost answers with the winner's.
      if (error instanceof UniqueConstraintError) {
        const existing = await this.operations.findByIdempotencyKey(dto.idempotencyKey);
        if (existing) return { operation: existing, replayed: false };
      }
      throw error;
    }
  }

  /**
   * Opens the barrier of the scanned module with the user's Pension Pass. The project comes from
   * the module, never from the client; OPERATIVO applies schedule and anti-passback and opens it.
   */
  async accessWithPensionPass(userId: string, dto: PensionPassAccessDto): Promise<MobileOperationRecord> {
    try {
      // Same key: the same answer (never a second barrier opening).
      const existing = await this.operations.findByIdempotencyKey(dto.idempotencyKey);
      if (existing) {
        if (String(existing.userId) !== userId || existing.type !== "PENSION_PASS_ACCESS" || existing.payload?.pensionPassId !== dto.pensionPassId) {
          throw CustomError.conflict("La clave ya fue usada para otra operacion");
        }
        return existing;
      }

      const pass = this.pensionPasses ? await this.pensionPasses.findById(dto.pensionPassId) : null;
      if (!pass || pass.usuario !== userId) throw CustomError.notFound("PensionPass no encontrado");
      if (!pass.estado || !pass.vigent || (pass.to !== -1 && pass.to < Date.now())) {
        throw CustomError.conflict("La pension no esta vigente", undefined, "PENSION_PASS_NOT_VALID");
      }
      const pension = this.pensions ? await this.pensions.findById(pass.pension) : null;
      const moduloId = decodeModuleId(dto.moduleToken);
      const modulo = moduloId ? await this.modulos.findById(moduloId) : null;
      if (!modulo || !["ENTRADA", "SALIDA"].includes(String(modulo.tipo))) throw CustomError.badRequest("El QR no identifica una entrada o salida");
      const proyectoId = String(modulo.proyecto ?? "");
      if (proyectoId !== dto.projectId || !pension || pension.proyecto !== proyectoId) {
        throw CustomError.conflict("El QR no pertenece al estacionamiento de la pension", undefined, "PARKING_QR_MISMATCH");
      }

      const installation = await this.installations.findApprovedByProyectoId(proyectoId);
      if (!installation || Date.now() - Number(installation.lastCommandPollAt ?? 0) > ONLINE_WINDOW_MS) {
        throw CustomError.serviceUnavailable("El estacionamiento esta desconectado; no se abrio la pluma", undefined, "PARKING_OFFLINE");
      }
      return await this.enqueueAndWait({
        idempotencyKey: dto.idempotencyKey,
        type: "PENSION_PASS_ACCESS",
        installationId: installation.installationId,
        proyectoId,
        userId,
        payload: { pensionPassId: dto.pensionPassId, moduleToken: dto.moduleToken },
      });
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        const existing = await this.operations.findByIdempotencyKey(dto.idempotencyKey);
        if (existing) return existing;
      }
      throw error;
    }
  }

  async getOperation(userId: string, operationId: string) {
    const operation = await this.operations.findByOperationId(operationId, userId);
    if (!operation) throw CustomError.notFound("Operacion no encontrada");
    return operation;
  }

  /** The ticket of the user's latest entry, or null. */
  async currentTicket(userId: string) {
    const operation = await this.operations.findLatestCompletedWithTicket(userId);
    return operation?.result?.ticket ?? null;
  }

  /** Each ticket once (its latest version), newest first, paginated. */
  async ticketHistory(userId: string, query: MobileHistoryQueryDto) {
    const operations = await this.operations.findCompletedWithTicket(userId, { from: query.from, to: query.to });
    const unique = new Map<string, unknown>();
    for (const operation of operations) {
      const ticket = operation.result?.ticket;
      const ticketId = String(ticket?.uid ?? ticket?.id ?? "");
      if (ticketId && !unique.has(ticketId)) unique.set(ticketId, ticket);
    }
    const tickets = [...unique.values()];
    return { ...page(tickets, query), tickets: tickets.slice((query.page - 1) * query.limit, query.page * query.limit) };
  }

  async paymentHistory(userId: string, query: MobileHistoryQueryDto) {
    const { total, payments } = await this.payments.getSerializedByUser(userId, { page: query.page, limit: query.limit, from: query.from, to: query.to });
    return { ...page({ total, items: payments }, query), payments };
  }

  async paymentDetail(userId: string, paymentId: string) {
    const payment = await this.payments.findSerializedByIdForUser(paymentId, userId);
    if (!payment) throw CustomError.notFound("Pago no encontrado");
    return payment;
  }

  /** Asks OPERATIVO to open the exit for the user's active ticket; returns its answer. */
  async exitTicket(userId: string, dto: ExitMobileTicketDto): Promise<MobileOperationRecord> {
    const moduloId = decodeModuleId(dto.moduleToken);
    const modulo = moduloId ? await this.modulos.findById(moduloId) : null;
    if (!modulo || modulo.tipo !== "SALIDA" || String(modulo.proyecto ?? "") !== dto.projectId) {
      throw CustomError.conflict("El QR de salida no pertenece al estacionamiento detectado", undefined, "PARKING_QR_MISMATCH");
    }
    const source = await this.operations.findLatestCompletedWithTicket(userId, ["CREATE_TICKET", "APPLY_TICKET_PAYMENT"]);
    if (!source) throw CustomError.notFound("Ticket activo no encontrado");
    if (String(source.proyectoId) !== dto.projectId) {
      throw CustomError.conflict("El ticket activo pertenece a otro estacionamiento", undefined, "PARKING_TICKET_MISMATCH");
    }
    return this.enqueueAndWait({
      idempotencyKey: dto.idempotencyKey,
      type: "EXIT_TICKET",
      installationId: String(source.installationId),
      proyectoId: String(source.proyectoId),
      userId,
      payload: { moduleToken: dto.moduleToken },
    });
  }

  /**
   * A Stripe PaymentIntent for the amount OPERATIVO quotes now. The same key returns the same
   * intent (`created: false`), never a second charge.
   */
  async createTicketPaymentIntent(userId: string, dto: TicketPaymentIntentDto): Promise<{ intent: PaymentIntent; created: boolean }> {
    const saved = await this.payments.findRecordByIdempotencyKey(dto.idempotencyKey);
    if (saved) {
      if (String(saved.user) !== userId || String(saved.reference?.id) !== dto.ticketId) throw CustomError.conflict("La clave ya fue usada para otro pago");
      const intent = stripeMocked()
        ? { id: String(saved.stripePaymentIntentId), client_secret: `pi_mock_${saved.stripePaymentIntentId}_secret_mock`, amount: Math.round(Number(saved.amount) * 100), currency: String(saved.currency).toLowerCase(), status: "requires_payment_method" }
        : await StripePlugin.client.paymentIntents.retrieve(String(saved.stripePaymentIntentId));
      return { intent, created: false };
    }

    const source = await this.operations.findCompletedTicketSource(userId, dto.ticketId);
    if (!source) throw CustomError.notFound("Ticket movil no encontrado");

    const quote = await this.enqueueAndWait({
      idempotencyKey: `${dto.idempotencyKey}:quote`,
      type: "QUOTE_TICKET",
      installationId: String(source.installationId),
      proyectoId: String(source.proyectoId),
      userId,
      payload: { ticketId: dto.ticketId },
    });
    if (quote.status !== "completed") throw CustomError.serviceUnavailable(quote.error || "El parking no respondio la cotizacion");
    const amount = Number(quote.result?.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw CustomError.conflict("La cotizacion local no es valida");

    const user = await this.usuarios.findById(userId);
    if (!user) throw CustomError.notFound("Usuario no encontrado");
    let intent: PaymentIntent;
    if (stripeMocked()) {
      const id = `mock_${randomUUID()}`;
      intent = { id, client_secret: `pi_mock_${id}_secret_mock`, amount: Math.round(amount * 100), currency: envs.STRIPE_CURRENCY.toLowerCase(), status: "requires_payment_method" };
    } else {
      intent = await StripePlugin.client.paymentIntents.create({
        amount: Math.round(amount * 100),
        currency: envs.STRIPE_CURRENCY,
        receipt_email: String(user.correo),
        automatic_payment_methods: { enabled: true },
        metadata: { type: "ticket", ticketId: dto.ticketId, userId, proyectoId: String(source.proyectoId) },
      }, { idempotencyKey: dto.idempotencyKey });
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
      idempotencyKey: dto.idempotencyKey,
      reference: { type: "ticket", id: dto.ticketId },
      parking: { id: String(source.proyectoId) },
      rawProviderStatus: intent.status,
    });
    return { intent, created: true };
  }

  /** Marks the payment once Stripe confirms it and asks OPERATIVO to apply it to the ticket. */
  async confirmTicketPayment(userId: string, ticketId: string, paymentIntentId: string) {
    const pending = await this.payments.findRecordForUser({ userId, stripePaymentIntentId: paymentIntentId, referenceId: ticketId });
    if (!pending) throw CustomError.notFound("Pago no encontrado");
    const providerStatus = stripeMocked() ? "succeeded" : (await StripePlugin.client.paymentIntents.retrieve(paymentIntentId)).status;
    if (providerStatus !== "succeeded") throw CustomError.conflict("Stripe aun no confirma el pago", { providerStatus });
    const payment = await this.payments.markSucceeded(pending.id, { rawProviderStatus: providerStatus, paidAt: Date.now() });
    if (!payment) throw CustomError.notFound("Pago no encontrado");

    const source = await this.operations.findLatestTicketSource(userId, ticketId);
    if (!source) throw CustomError.conflict("No se encontro el parking del ticket");
    const operation = await this.enqueueAndWait({
      idempotencyKey: `apply:${paymentIntentId}`,
      type: "APPLY_TICKET_PAYMENT",
      installationId: String(source.installationId),
      proyectoId: String(source.proyectoId),
      userId,
      payload: { ticketId, providerReference: paymentIntentId, amount: payment.amount, currency: payment.currency, paidAt: payment.paidAt },
    });
    return { payment, operation };
  }

  /** Creates the command (once per key) and waits up to 15 s for OPERATIVO's answer. */
  private async enqueueAndWait(input: OperationInput): Promise<MobileOperationRecord> {
    let operation = await this.operations.findByIdempotencyKey(input.idempotencyKey);
    if (!operation) {
      const now = Date.now();
      // Opening a barrier late, once the user left, is worse than not opening it: short life.
      const expiresAt = input.type === "APPLY_TICKET_PAYMENT" ? undefined : now + (input.type === "PENSION_PASS_ACCESS" ? 15_000 : 30_000);
      // A rejected barrier opening is final: the app already showed the error to the user.
      const maxAttempts = input.type === "APPLY_TICKET_PAYMENT" ? 12 : input.type === "PENSION_PASS_ACCESS" ? 1 : 3;
      operation = await this.operations.create({ operationId: randomUUID(), ...input, status: "pending", attempts: 0, maxAttempts, nextRetryAt: now, createdAt: now, expiresAt, updatedAt: now });
    }
    for (let attempt = 0; attempt < WAIT_ATTEMPTS && !["completed", "failed"].includes(String(operation.status)); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, WAIT_STEP_MS));
      operation = await this.operations.findByOperationId(operation.operationId) ?? operation;
    }
    return operation;
  }
}
