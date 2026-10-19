import { PostgresDatabase } from "../../../data/postgres";
import type { ExternalPaymentOrder as Row, Prisma } from "../../../generated/prisma/client";
import { ExternalOrderRepository, type ExternalOrder, type ExternalQuote, type ExternalIntent } from "../../../domain/external-payments/external-payment";
import { CustomError } from "../../../domain/errors/custom.error";
import type { ExternalOrderFilters, ExternalOrderAdmin } from "../../../domain/external-payments/external-payment";

const map = (row: Row): ExternalOrder => ({ ...row, userId: row.usuarioId,
  expiresAt: row.expiresAt.getTime(), intentStartedAt: row.intentStartedAt?.getTime() ?? null });

const event = (kind: string, detail = "") => ({ create: { kind, detail } });

export class ExternalOrderPostgresRepository extends ExternalOrderRepository {
  private get db() { return PostgresDatabase.client; }

  async listAdmin(filters: ExternalOrderFilters, page: number, limit: number) {
    const where: Prisma.ExternalPaymentOrderWhereInput = {
      status: filters.status, provider: filters.provider, usuarioId: filters.userId,
      createdAt: { ...(filters.from !== undefined ? { gte: new Date(filters.from) } : {}), ...(filters.to !== undefined ? { lte: new Date(filters.to) } : {}) },
    };
    const [total, rows] = await this.db.$transaction([
      this.db.externalPaymentOrder.count({ where }),
      this.db.externalPaymentOrder.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * limit, take: limit }),
    ], { isolationLevel: "RepeatableRead" });
    const orders: ExternalOrderAdmin[] = rows.map(row => ({
      ...map(row), lastError: row.lastError, nextRetryAt: row.nextRetryAt.getTime(),
      leaseUntil: row.leaseUntil?.getTime() ?? null, createdAt: row.createdAt.getTime(),
    }));
    // Explicit projection keeps internal Prisma fields out of the administrative API too.
    return { total, orders: orders.map(row => ({
      id: row.id, provider: row.provider, reference: row.reference, userId: row.userId, proyectoId: row.proyectoId,
      ticket: row.ticket, parkingId: row.parkingId, parkingName: row.parkingName,
      amountMinor: row.amountMinor, currency: row.currency, expiresAt: row.expiresAt, status: row.status,
      stripePaymentIntentId: row.stripePaymentIntentId, intentStartedAt: row.intentStartedAt,
      attempts: row.attempts, confirmationReference: row.confirmationReference,
      lastError: row.lastError, nextRetryAt: row.nextRetryAt, leaseUntil: row.leaseUntil, createdAt: row.createdAt,
    })) };
  }

  async events(id: string, page: number, limit: number) {
    const where = { orderId: id };
    const [total, rows] = await this.db.$transaction([
      this.db.externalPaymentEvent.count({ where }),
      this.db.externalPaymentEvent.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * limit, take: limit }),
    ], { isolationLevel: "RepeatableRead" });
    return { total, events: rows.map(row => ({ id: row.id, kind: row.kind, detail: row.detail, createdAt: row.createdAt.getTime() })) };
  }

  async retryConfirmation(id: string, actorId: string, reason: string, intent: ExternalIntent, now: number) {
    await this.locked(id, async (tx, row) => {
      this.checkBinding(row, intent);
      if (row.status !== "confirmation_failed" || (row.leaseUntil && row.leaseUntil.getTime() > now) || intent.status !== "succeeded") {
        throw CustomError.conflict("Orden no disponible para reintento");
      }
      const payment = await tx.payment.findUnique({ where: { stripePaymentIntentId: intent.id } });
      if (!payment || payment.status !== "succeeded" || payment.type !== "external" || payment.referenceId !== id || payment.usuarioId !== row.usuarioId) {
        throw CustomError.conflict("El registro del cobro no permite reintentar");
      }
      await tx.externalPaymentOrder.update({ where: { id }, data: {
        status: "paid", attempts: 0, nextRetryAt: new Date(now), leaseOwner: "", leaseUntil: null, lastError: "",
        events: event("manual_confirmation_retry", JSON.stringify({ actorId, reason, previousAttempts: row.attempts, paymentIntentId: intent.id })),
      } });
      await tx.payment.update({ where: { id: payment.id }, data: { reconciliationStatus: "pending", reconciliationError: "" } });
      // The incident remains open until the provider actually confirms.
    });
  }

  async saveQuote(userId: string, provider: string, quote: ExternalQuote, now: number, proyectoId: string | null = null) {
    // One live order per provider reference, even across users and concurrent QR scans.
    const where = { provider, reference: quote.reference, status: { notIn: ["expired" as const, "refunded" as const] } };
    const existing = await this.db.externalPaymentOrder.findFirst({ where });
    if (existing) {
      // An abandoned quote (no charge started) frees the reference once it expires.
      if (existing.status !== "quoted" || existing.expiresAt.getTime() > now) return map(existing);
      await this.expire(existing.id);
    }
    try {
      const row = await this.db.externalPaymentOrder.create({
        data: { provider, reference: quote.reference, usuarioId: userId, proyectoId,
          ticket: quote.ticket, parkingId: quote.parking.id, parkingName: quote.parking.name,
          amountMinor: quote.amountMinor, currency: quote.currency, expiresAt: new Date(quote.expiresAt),
          events: event("quoted") },
      });
      return map(row);
    } catch (error) {
      // A racing scan may have inserted the canonical order after our initial read.
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
        const winner = await this.db.externalPaymentOrder.findFirst({ where });
        if (winner) return map(winner);
      }
      throw error;
    }
  }

  async find(id: string) {
    const row = await this.db.externalPaymentOrder.findUnique({ where: { id } });
    return row ? map(row) : null;
  }

  async beginIntent(id: string, now: number) {
    return this.locked(id, async (tx, row) => {
      if (!["quoted", "payment_pending"].includes(row.status) || row.expiresAt.getTime() <= now) {
        throw CustomError.conflict("Orden no disponible para cobro");
      }
      if (row.status === "payment_pending") return map(row);
      return map(await tx.externalPaymentOrder.update({ where: { id }, data: {
        status: "payment_pending", intentStartedAt: new Date(now), events: event("intent_started"),
      } }));
    });
  }

  private checkBinding(row: Row, intent: ExternalIntent) {
    if (row.id !== intent.orderId || row.usuarioId !== intent.userId || row.amountMinor !== intent.amountMinor ||
      row.currency !== intent.currency.toUpperCase() || (row.stripePaymentIntentId && row.stripePaymentIntentId !== intent.id)) {
      throw CustomError.conflict("Pago externo inconsistente");
    }
  }

  private async payment(tx: Prisma.TransactionClient, row: Row, intent: ExternalIntent) {
    this.checkBinding(row, intent);
    return tx.payment.upsert({ where: { stripePaymentIntentId: intent.id }, update: {}, create: {
      usuarioId: row.usuarioId, type: "external", concept: `Estacionamiento externo: ${row.parkingName}`,
      amount: (row.amountMinor / 100).toFixed(2), currency: row.currency, status: "pending", paidAt: row.createdAt,
      stripePaymentIntentId: intent.id, idempotencyKey: `external-intent:${row.id}`,
      referenceType: "external", referenceId: row.id, parkingName: row.parkingName,
      rawProviderStatus: intent.status, metadata: { provider: row.provider, externalReference: row.reference },
    } });
  }

  async attachIntent(order: ExternalOrder, intent: ExternalIntent) {
    await this.locked(order.id, async (tx, row) => {
      this.checkBinding(row, intent);
      if (!row.intentStartedAt) throw CustomError.conflict("Cobro no iniciado");
      await this.payment(tx, row, intent);
      if (!row.stripePaymentIntentId) await tx.externalPaymentOrder.update({ where: { id: row.id },
        data: { stripePaymentIntentId: intent.id, events: event("intent_attached", intent.id) } });
    });
  }

  async markPaid(order: ExternalOrder, intent: ExternalIntent, now: number) {
    await this.locked(order.id, async (tx, row) => {
      this.checkBinding(row, intent);
      if (row.status === "refunded") return;
      if (!row.intentStartedAt) throw CustomError.conflict("Cobro no iniciado");
      await this.payment(tx, row, intent);
      // Duplicate webhooks cannot reset confirmation/review or paidAt.
      await tx.payment.updateMany({ where: { stripePaymentIntentId: intent.id, status: { in: ["pending", "failed"] } },
        data: { status: "succeeded", paidAt: new Date(now), rawProviderStatus: "succeeded" } });
      if (["payment_pending", "expired"].includes(row.status)) {
        await tx.externalPaymentOrder.update({ where: { id: row.id }, data: {
          status: "paid", stripePaymentIntentId: intent.id, nextRetryAt: new Date(now), events: event("paid", intent.id),
        } });
      }
    });
  }

  async expire(id: string) {
    await this.locked(id, async (tx, row) => {
      if (!["quoted", "payment_pending"].includes(row.status)) return;
      await tx.externalPaymentOrder.update({ where: { id }, data: { status: "expired", events: event("expired") } });
      if (row.stripePaymentIntentId) await tx.payment.updateMany({
        where: { stripePaymentIntentId: row.stripePaymentIntentId, status: "pending" }, data: { status: "failed", rawProviderStatus: "canceled" },
      });
    });
  }

  async pending(limit: number) {
    const now = new Date();
    return (await this.db.externalPaymentOrder.findMany({
      where: { OR: [
        { status: "quoted", expiresAt: { lte: now } },
        { status: "payment_pending", nextRetryAt: { lte: now } },
        { status: "paid", nextRetryAt: { lte: now }, OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] },
      ] }, orderBy: { nextRetryAt: "asc" }, take: limit,
    })).map(map);
  }

  async deferPending(id: string, now: number) {
    await this.db.externalPaymentOrder.updateMany({ where: { id, status: "payment_pending" },
      data: { nextRetryAt: new Date(now + 60_000) } });
  }

  async claimConfirmation(id: string, lease: string, now: number) {
    const result = await this.db.externalPaymentOrder.updateMany({ where: {
      id, status: "paid", nextRetryAt: { lte: new Date(now) }, OR: [{ leaseUntil: null }, { leaseUntil: { lte: new Date(now) } }],
    }, data: { leaseOwner: lease, leaseUntil: new Date(now + 60_000), attempts: { increment: 1 } } });
    return result.count ? this.find(id) : null;
  }

  async confirmed(id: string, lease: string, reference: string, now: number) {
    await this.locked(id, async (tx, row) => {
      if (row.status !== "paid" || row.leaseOwner !== lease) return;
      await tx.externalPaymentOrder.update({ where: { id }, data: {
        status: "confirmed", confirmationReference: reference, leaseOwner: "", leaseUntil: null,
        lastError: "", events: event("confirmed", reference),
      } });
      await tx.payment.updateMany({ where: { stripePaymentIntentId: row.stripePaymentIntentId! }, data: {
        reconciliationStatus: "reconciled", reconciledAt: new Date(now), appliedAt: new Date(now),
        appliedOperationKey: `external-confirm:${id}`, reconciliationError: "",
      } });
      await tx.operationalIncident.updateMany({ where: { incidentKey: `external-payment:${id}` },
        data: { status: "resolved", resolvedAt: new Date(now), lastSeenAt: new Date(now) } });
    });
  }

  async confirmationFailed(id: string, lease: string, now: number, maxAttempts: number) {
    await this.locked(id, async (tx, row) => {
      if (row.status !== "paid" || row.leaseOwner !== lease) return;
      const exhausted = row.attempts >= maxAttempts;
      const reason = exhausted ? "EXTERNAL_CONFIRMATION_EXHAUSTED" : "EXTERNAL_CONFIRMATION_RETRY";
      await tx.externalPaymentOrder.update({ where: { id }, data: {
        status: exhausted ? "confirmation_failed" : "paid", leaseOwner: "", leaseUntil: null,
        nextRetryAt: new Date(now + Math.min(3600_000, 5000 * 2 ** Math.min(row.attempts - 1, 10))),
        lastError: reason, events: event("confirmation_failed", reason),
      } });
      if (exhausted) {
        await this.incident(tx, row, reason, now);
        await tx.payment.updateMany({ where: { stripePaymentIntentId: row.stripePaymentIntentId! },
          data: { reconciliationStatus: "failed", reconciliationError: reason } });
      }
    });
  }

  async flagReview(id: string, reason: string, now: number) {
    await this.locked(id, async (tx, row) => {
      if (["confirmed", "refunded"].includes(row.status)) return;
      await tx.externalPaymentOrder.update({ where: { id }, data: {
        lastError: reason, nextRetryAt: new Date(now + 60_000), events: event("review_required", reason),
      } });
      await this.incident(tx, row, reason, now);
    });
  }

  private async incident(tx: Prisma.TransactionClient, row: Row, reason: string, now: number) {
    const payment = row.stripePaymentIntentId
      ? await tx.payment.findUnique({ where: { stripePaymentIntentId: row.stripePaymentIntentId }, select: { id: true } })
      : null;
    await tx.operationalIncident.upsert({ where: { incidentKey: `external-payment:${row.id}` },
      create: { incidentKey: `external-payment:${row.id}`, type: "EXTERNAL_PAYMENT_REVIEW", status: "open", severity: "critical",
        source: "external-payments", paymentId: payment?.id ?? "", message: reason,
        metadata: { orderId: row.id, provider: row.provider }, openedAt: new Date(now), lastSeenAt: new Date(now) },
      update: { status: "open", resolvedAt: null, paymentId: payment?.id ?? "", message: reason, lastSeenAt: new Date(now) },
    });
  }

  private locked<T>(id: string, work: (tx: Prisma.TransactionClient, row: Row) => Promise<T>): Promise<T> {
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM external_payment_orders WHERE id = ${id}::uuid FOR UPDATE`;
      const row = await tx.externalPaymentOrder.findUnique({ where: { id } });
      if (!row) throw CustomError.notFound("Orden externa no encontrada");
      return work(tx, row);
    });
  }
}
