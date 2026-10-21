import { PostgresDatabase } from "../../../data/postgres";
import { Prisma } from "../../../generated/prisma/client";
import { markHourlyPending } from "../../statistics/hourly-totals.postgres";

// Only these fixed identifiers may enter SQL; payloads always use parameters.
export const operationalTables: Record<string, string> = {
  ticket: "operational_tickets",
  payment: "operational_payments",
  cash_payment_session: "operational_cash_payment_sessions",
  cash_register_shift: "operational_cash_register_shifts",
  cash_register_movement: "operational_cash_register_movements",
  cash_register_cut: "operational_cash_register_cuts",
  pension_move: "operational_pension_moves",
  parking_rate: "operational_parking_rates",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MONEY = /^\d{1,10}(\.\d{1,2})?$/;

/** A malformed parking rate version stays pending instead of becoming the rate in force. */
const validateParkingRate = (payload: Record<string, unknown>) => {
  const version = payload.version;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) throw new Error("Invalid snapshot version");
  for (const field of ["tolerance_minutes", "first_block_minutes", "fraction_minutes"]) {
    if (typeof payload[field] !== "number" || !Number.isInteger(payload[field])) throw new Error(`Invalid snapshot minutes: ${field}`);
  }
  for (const field of ["first_block_price", "fraction_price"]) {
    if (!MONEY.test(String(payload[field]))) throw new Error(`Invalid snapshot money: ${field}`);
  }
  if (payload.daily_max !== null && !MONEY.test(String(payload.daily_max))) throw new Error("Invalid snapshot money: daily_max");
};

type Payload = Record<string, unknown>;

/** Columns whose hour the statistics totals depend on (docs/estadisticas-carga.md §5). */
const statisticsHours: Record<string, string[]> = {
  ticket: ["hora_inicio", "hora_salida"],
  payment: ["paid_at"],
};
type TypedColumn = { name: string; value: Prisma.Sql };

const EARLIEST = Date.UTC(2020, 0, 1);
const DAY_MS = 86_400_000;

/**
 * An instant from the snapshot. Impossible dates (before 2020 or more than a day ahead, like
 * the year-2200 tickets seen in cobrocaja) keep the event pending instead of entering reports.
 */
const instant = (payload: Payload, field: string, options: { nullable?: boolean } = {}) => {
  const value = payload[field];
  if ((value === null || value === undefined) && options.nullable) return null;
  const time = typeof value === "string" ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(time) || time < EARLIEST || time > Date.now() + DAY_MS) throw new Error(`Invalid snapshot date: ${field}`);
  return new Date(time);
};

const money = (payload: Payload, field: string) => {
  const value = String(payload[field]);
  if (!/^-?\d{1,10}(\.\d{1,2})?$/.test(value)) throw new Error(`Invalid snapshot money: ${field}`);
  return Prisma.sql`${value}::numeric`;
};

const text = (payload: Payload, field: string, max = 64) => {
  const value = payload[field];
  return typeof value === "string" && value.length <= max ? value : null;
};

/** How a payment was made, from what OPERATIVO records about it. */
const paymentMethod = (payload: Payload) => {
  const reference = String(payload.provider_reference ?? "");
  if (reference.startsWith("pos_session_") || payload.raw_provider_status === "cash") return "efectivo";
  if (reference.startsWith("pi_")) return "tarjeta";
  return "sin_identificar";
};

/**
 * Typed copies of what statistics filter and add up (docs/estadisticas.md §2), so queries use
 * indexes instead of casting the JSON of every row. A malformed value keeps the event pending.
 */
const typedColumns: Record<string, (payload: Payload) => TypedColumn[]> = {
  pension_move: (payload) => {
    const pensionPassId = payload.pension_pass_id;
    if (typeof pensionPassId !== "string" || !UUID.test(pensionPassId)) throw new Error("Invalid snapshot pension_pass_id");
    return [
      { name: "pension_pass_id", value: Prisma.sql`${pensionPassId}::uuid` },
      { name: "fecha", value: Prisma.sql`${instant(payload, "fecha")}` },
    ];
  },
  payment: (payload) => [
    { name: "paid_at", value: Prisma.sql`${instant(payload, "paid_at")}` },
    { name: "amount", value: money(payload, "amount") },
    { name: "currency", value: Prisma.sql`${String(payload.currency ?? "").toUpperCase().slice(0, 3)}` },
    { name: "status", value: Prisma.sql`${text(payload, "status")}` },
    { name: "payment_type", value: Prisma.sql`${text(payload, "type")}` },
    { name: "method", value: Prisma.sql`${paymentMethod(payload)}` },
    { name: "provider_reference", value: Prisma.sql`${text(payload, "provider_reference", 256)}` },
  ],
  ticket: (payload) => {
    if (typeof payload.pagado !== "boolean") throw new Error("Invalid snapshot pagado");
    return [
      { name: "hora_inicio", value: Prisma.sql`${instant(payload, "hora_inicio")}` },
      { name: "hora_salida", value: Prisma.sql`${instant(payload, "hora_salida", { nullable: true })}` },
      { name: "monto", value: money(payload, "monto") },
      { name: "pagado", value: Prisma.sql`${payload.pagado}` },
      { name: "status", value: Prisma.sql`${text(payload, "status")}` },
    ];
  },
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
        const typed = Object.hasOwn(typedColumns, kind) ? typedColumns[kind](payload) : [];
        if (kind === "parking_rate") validateParkingRate(payload);
        const typedNames = typed.map((column) => Prisma.raw(column.name));
        const hourColumns = Object.hasOwn(statisticsHours, kind) ? statisticsHours[kind] : [];
        const rowKey = Prisma.sql`proyecto_id = ${event.proyectoId}::uuid AND installation_id = ${event.installationId} AND aggregate_id = ${event.aggregateId}`;
        const readHours = async () => hourColumns.length
          ? tx.$queryRaw<Array<Record<string, Date | null>>>(Prisma.sql`
              SELECT ${Prisma.join(hourColumns.map((column) => Prisma.raw(column)))} FROM ${Prisma.raw(table)} WHERE ${rowKey}`)
          : [];
        const before = await readHours();
        // Full snapshots allow updates to arrive before inserts. The upsert's predicate
        // is atomic even when different workers process the same aggregate concurrently.
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO ${Prisma.raw(table)} AS current
            (proyecto_id, installation_id, aggregate_id, occurred_at, source_position, event_id, payload${typed.length ? Prisma.sql`, ${Prisma.join(typedNames)}` : Prisma.empty})
          VALUES (${event.proyectoId}::uuid, ${event.installationId}, ${event.aggregateId}, ${event.occurredAt}, ${event.sourcePosition}, ${event.eventId}, ${JSON.stringify(payload)}::jsonb${typed.length ? Prisma.sql`, ${Prisma.join(typed.map((column) => column.value))}` : Prisma.empty})
          ON CONFLICT (proyecto_id, installation_id, aggregate_id) DO UPDATE SET
            occurred_at = EXCLUDED.occurred_at, source_position = EXCLUDED.source_position,
            event_id = EXCLUDED.event_id, payload = EXCLUDED.payload${typed.length ? Prisma.sql`, ${Prisma.join(typed.map((column) => Prisma.sql`${Prisma.raw(column.name)} = EXCLUDED.${Prisma.raw(column.name)}`))}` : Prisma.empty}
          WHERE CASE WHEN current.source_position IS NOT NULL AND EXCLUDED.source_position IS NOT NULL
            THEN EXCLUDED.source_position > current.source_position
            ELSE (EXCLUDED.occurred_at, EXCLUDED.event_id) > (current.occurred_at, current.event_id) END
        `);
        if (hourColumns.length) {
          // The hours before and after the change get their totals recomputed; for a payment,
          // also those of the other rows of the same charge (only the latest one counts).
          const rows = [...before, ...(await readHours())];
          if (kind === "payment") {
            rows.push(...await tx.$queryRaw<Array<Record<string, Date | null>>>(Prisma.sql`
              SELECT o.paid_at FROM operational_payments o
              WHERE o.proyecto_id = ${event.proyectoId}::uuid AND o.provider_reference IS NOT NULL
                AND o.provider_reference = (SELECT provider_reference FROM operational_payments WHERE ${rowKey})`));
          }
          await markHourlyPending(tx, event.proyectoId, rows.flatMap((row) => hourColumns.map((column) => row[column])));
        }
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
