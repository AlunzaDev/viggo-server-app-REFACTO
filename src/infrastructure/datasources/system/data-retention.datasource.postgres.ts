import { PostgresDatabase } from "../../../data/postgres";
import { Prisma } from "../../../generated/prisma/client";
import { DataRetentionDatasource, type RetentionTarget } from "../../../domain/datasources/system/data-retention.datasource";
import { isUuid } from "../postgres/prisma-errors";

/** The mirror tables of OPERATIVO: purged per parking through their (proyecto_id, occurred_at) index. */
const OPERATIONAL_TABLES: Partial<Record<RetentionTarget, string>> = {
  operational_tickets: "operational_tickets",
  operational_payments: "operational_payments",
  operational_pension_moves: "operational_pension_moves",
  operational_cash_payment_sessions: "operational_cash_payment_sessions",
  operational_cash_register_shifts: "operational_cash_register_shifts",
  operational_cash_register_movements: "operational_cash_register_movements",
  operational_cash_register_cuts: "operational_cash_register_cuts",
};

export class DataRetentionPostgresDatasource extends DataRetentionDatasource {
  private get db() {
    return PostgresDatabase.client;
  }

  async listProjectIds() {
    return (await this.db.proyecto.findMany({ select: { id: true } })).map((row) => row.id);
  }

  async purgeBatch(target: RetentionTarget, before: number, limit: number, proyectoId?: string | null) {
    const cutoff = new Date(before);
    if (proyectoId && !isUuid(proyectoId)) return 0;
    const parking = proyectoId ? Prisma.sql`proyecto_id = ${proyectoId}::uuid` : Prisma.sql`proyecto_id IS NULL`;

    const table = OPERATIONAL_TABLES[target];
    if (table) {
      if (!proyectoId) return 0;
      return this.db.$executeRaw(Prisma.sql`
        DELETE FROM ${Prisma.raw(table)} WHERE ctid IN (
          SELECT ctid FROM ${Prisma.raw(table)} WHERE ${parking} AND occurred_at < ${cutoff} LIMIT ${limit})`);
    }

    switch (target) {
      case "inbox_events":
        // Only processed events: pending or failed ones are never purged.
        if (!proyectoId) return 0;
        return this.db.$executeRaw(Prisma.sql`
          DELETE FROM inbox_events WHERE ctid IN (
            SELECT ctid FROM inbox_events
            WHERE ${parking} AND occurred_at < ${cutoff} AND processed_at IS NOT NULL AND processed_at < ${cutoff}
            LIMIT ${limit})`);
      case "connection_events":
        if (!proyectoId) return 0;
        return this.db.$executeRaw(Prisma.sql`
          DELETE FROM connection_events WHERE ctid IN (
            SELECT ctid FROM connection_events WHERE ${parking} AND occurred_at < ${cutoff} LIMIT ${limit})`);
      case "mobile_operations":
        // Finished operations only; dead_letter stays until someone resolves it.
        return this.db.$executeRaw(Prisma.sql`
          DELETE FROM mobile_operations WHERE ctid IN (
            SELECT ctid FROM mobile_operations
            WHERE status IN ('completed', 'expired') AND updated_at < ${cutoff} LIMIT ${limit})`);
      case "operational_incidents":
        return this.db.$executeRaw(Prisma.sql`
          DELETE FROM operational_incidents WHERE ctid IN (
            SELECT ctid FROM operational_incidents
            WHERE status = 'resolved' AND last_seen_at < ${cutoff} AND resolved_at < ${cutoff} LIMIT ${limit})`);
      case "push_subscriptions":
        return this.db.$executeRaw(Prisma.sql`
          DELETE FROM push_subscriptions WHERE ctid IN (
            SELECT ctid FROM push_subscriptions WHERE COALESCE(last_success_at, created_at) < ${cutoff} LIMIT ${limit})`);
      case "payments":
        // Untouched for the whole period: created and last updated before the cut-off.
        return this.db.$executeRaw(Prisma.sql`
          DELETE FROM payments WHERE ctid IN (
            SELECT ctid FROM payments WHERE updated_at < ${cutoff} AND created_at < ${cutoff} LIMIT ${limit})`);
      case "external_payments": {
        // An order goes with its events (they reference it): events first, then the order.
        const orders = Prisma.sql`SELECT id FROM external_payment_orders
          WHERE ${parking} AND created_at < ${cutoff} AND updated_at < ${cutoff} LIMIT ${limit}`;
        return this.db.$transaction(async (tx) => {
          const ids = (await tx.$queryRaw<Array<{ id: string }>>(orders)).map((row) => row.id);
          if (!ids.length) return 0;
          const list = Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`));
          await tx.$executeRaw(Prisma.sql`DELETE FROM external_payment_events WHERE order_id IN (${list})`);
          return tx.$executeRaw(Prisma.sql`DELETE FROM external_payment_orders WHERE id IN (${list})`);
        });
      }
      default:
        return 0;
    }
  }
}
