/** Largest capacity accepted: a typo, not a parking, beyond this. */
export const MAX_CAPACITY = 100_000;

/**
 * Parking spaces of a project (docs/estadisticas.md §4): a whole number from 1, or null when it
 * was not captured. Without it the occupancy is "no disponible", never a made-up percentage.
 * Returns the problem, or the value (undefined when the field did not come).
 */
export const parseCapacity = (value: unknown): [string | null, number | null | undefined] => {
  if (value === undefined) return [null, undefined];
  if (value === null || value === "") return [null, null];
  const capacity = typeof value === "number" ? value : typeof value === "string" && /^\s*\d+\s*$/.test(value) ? Number(value) : Number.NaN;
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > MAX_CAPACITY) {
    return [`'capacidad' debe ser un número entero de lugares entre 1 y ${MAX_CAPACITY}`, undefined];
  }
  return [null, capacity];
};
