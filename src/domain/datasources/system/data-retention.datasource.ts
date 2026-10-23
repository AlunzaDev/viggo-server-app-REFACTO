/**
 * What can be purged (docs/retencion.md). Each one deletes only finished data older than its
 * cut-off: nothing pending, open or unprocessed.
 */
export const RETENTION_TARGETS = [
  "inbox_events",
  "mobile_operations",
  "operational_incidents",
  "connection_events",
  "push_subscriptions",
  "operational_tickets",
  "operational_payments",
  "operational_pension_moves",
  "operational_cash_payment_sessions",
  "operational_cash_register_shifts",
  "operational_cash_register_movements",
  "operational_cash_register_cuts",
  "external_payments",
  "payments",
] as const;
export type RetentionTarget = (typeof RETENTION_TARGETS)[number];

export abstract class DataRetentionDatasource {
  /** Every parking id, active or not: the big tables are purged one parking at a time. */
  abstract listProjectIds(): Promise<string[]>;
  /**
   * Deletes at most `limit` rows of `target` older than `before`; for the per-parking targets,
   * only rows of `proyectoId` (null: rows without a parking). Returns how many it deleted.
   */
  abstract purgeBatch(target: RetentionTarget, before: number, limit: number, proyectoId?: string | null): Promise<number>;
}
