/** Zone of projects that have not chosen one (where every parking was until zones existed). */
export const DEFAULT_TIME_ZONE = "America/Mexico_City";

/** An IANA zone the runtime knows, e.g. "America/Tijuana". */
export const isValidTimeZone = (value: unknown): value is string => {
  if (typeof value !== "string" || !value.trim() || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
};
