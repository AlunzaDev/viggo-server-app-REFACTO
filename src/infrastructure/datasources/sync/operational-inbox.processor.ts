import { PostgresDatabase } from "../../../data/postgres";
import { Prisma } from "../../../generated/prisma/client";

// Only these fixed identifiers may enter SQL; payloads always use parameters.
export const operationalTables: Record<string, string> = {
  ticket: "operational_tickets",
  payment: "operational_payments",
  cash_payment_session: "operational_cash_payment_sessions",
  cash_register_shift: "operational_cash_register_shifts",
  cash_register_movement: "operational_cash_register_movements",
  cash_register_cut: "operational_cash_register_cuts",
  pension_move: "operational_pension_moves",
};

export class OperationalInboxProcessor {
  async processEvent(eventId: string): Promise<void> {
    const db = PostgresDatabase.client;
    try {
      await db.$transaction(async tx => {
        await tx.$queryRaw`SELECT event_id FROM inbox_events WHERE event_id = ${eventId} FOR UPDATE`;
        const event = await tx.inboxEvent.findUnique({ where: { eventId } });
        if (!event || event.processedAt) return;
        const [kind, action, extra] = event.eventType.split(".");
        const table = Object.hasOwn(operationalTables, kind) ? operationalTables[kind] : undefined;
        if (!table || event.eventType.split(".").length !== 2 || extra || !["created", "updated"].includes(action)) throw new Error(`Unsupported eventType: ${event.eventType}`);
        const payload = event.payload as Record<string, unknown>;
        if (!payload || Array.isArray(payload) || typeof payload !== "object" || payload.id !== event.aggregateId) throw new Error("Snapshot id differs from aggregateId");
        if (payload.proyecto_id && payload.proyecto_id !== event.proyectoId) throw new Error("Snapshot belongs to another project");
        // A bad row must remain pending rather than poison historical report casts.
        for (const field of ["hora_inicio", "paid_at", "started_at", "created_at", "opened_at"]) {
          if (payload[field] !== undefined && (typeof payload[field] !== "string" || !Number.isFinite(Date.parse(payload[field] as string)))) {
            throw new Error(`Invalid snapshot date: ${field}`);
          }
        }
        for (const field of ["monto", "amount", "amount_expected", "amount_received", "change_amount", "opening_amount"]) {
          if (payload[field] !== undefined && (payload[field] === null || !/^-?\d{1,10}(\.\d{1,2})?$/.test(String(payload[field])))) {
            throw new Error(`Invalid snapshot money: ${field}`);
          }
        }
        if (payload.pagado !== undefined && typeof payload.pagado !== "boolean") throw new Error("Invalid snapshot pagado");
        // Full snapshots allow updates to arrive before inserts. The upsert's predicate
        // is atomic even when different workers process the same aggregate concurrently.
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO ${Prisma.raw(table)} AS current
            (proyecto_id, installation_id, aggregate_id, occurred_at, source_position, event_id, payload)
          VALUES (${event.proyectoId}::uuid, ${event.installationId}, ${event.aggregateId}, ${event.occurredAt}, ${event.sourcePosition}, ${event.eventId}, ${JSON.stringify(payload)}::jsonb)
          ON CONFLICT (proyecto_id, installation_id, aggregate_id) DO UPDATE SET
            occurred_at = EXCLUDED.occurred_at, source_position = EXCLUDED.source_position,
            event_id = EXCLUDED.event_id, payload = EXCLUDED.payload
          WHERE CASE WHEN current.source_position IS NOT NULL AND EXCLUDED.source_position IS NOT NULL
            THEN EXCLUDED.source_position > current.source_position
            ELSE (EXCLUDED.occurred_at, EXCLUDED.event_id) > (current.occurred_at, current.event_id) END
        `);
        await tx.inboxEvent.update({ where: { eventId }, data: { processedAt: new Date(), processingError: "" } });
      });
    } catch (error) {
      // A durable receipt is acknowledged even on projection errors. Keep it pending
      // for retry, without rolling back other events or blocking the local outbox.
      await db.inboxEvent.updateMany({ where: { eventId, processedAt: null }, data: {
        lastAttemptAt: new Date(),
        processingError: (error instanceof Error ? error.message : String(error)).slice(0, 2000),
      } });
    }
  }

  async processPending(limit = 100): Promise<void> {
    const pending = await PostgresDatabase.client.inboxEvent.findMany({
      where: { processedAt: null, OR: [{ lastAttemptAt: null }, { lastAttemptAt: { lt: new Date(Date.now() - 60_000) } }] },
      orderBy: [{ lastAttemptAt: { sort: "asc", nulls: "first" } }, { receivedAt: "asc" }], take: limit,
    });
    for (const event of pending) await this.processEvent(event.eventId);
  }
}
