/**
 * Statistics totals per parking and hour (docs/estadisticas-carga.md §5, #55). The metrics
 * read them instead of adding up every ticket and payment; they are recomputed from the
 * source tables when an hour's rows change.
 */
export abstract class HourlyTotalsStore {
  /**
   * Marks the hours touched by cloud payment changes and recomputes up to `limit` pending
   * hours. Returns how many hours it recomputed.
   */
  abstract refresh(now: number, limit: number): Promise<number>;

  /** Recomputes every hour of [from, to) of the parkings (all of them when null). */
  abstract rebuild(proyectos: string[] | null, from: number, to: number): Promise<void>;
}
