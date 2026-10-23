import type { ConnectionSubject } from "../../datasources/heartbeat/connection-history.datasource";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Default period: the last 7 days. */
const DEFAULT_DAYS = 7;
/** Longest period asked at once. */
const MAX_DAYS = 92;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SUBJECTS: ConnectionSubject[] = ["instalacion", "modulo"];

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/** An instant as epoch milliseconds or an ISO date; undefined when absent, NaN when invalid. */
const instant = (value: unknown): number | undefined => {
  const raw = text(value);
  if (!raw) return undefined;
  return /^\d+$/.test(raw) ? Number(raw) : Date.parse(raw);
};

/** Filters of GET /api/heartbeat/historial (REFACTO#63). */
export class ConnectionHistoryQueryDto {
  private constructor(
    public readonly desde: number,
    public readonly hasta: number,
    public readonly page: number,
    public readonly limit: number,
    public readonly proyectoId?: string,
    public readonly moduloId?: string,
    public readonly sujeto?: ConnectionSubject,
  ) {}

  static create(query: Record<string, unknown>, now = Date.now()): [string?, ConnectionHistoryQueryDto?] {
    const hasta = instant(query.hasta) ?? now;
    const desde = instant(query.desde) ?? hasta - DEFAULT_DAYS * DAY_MS;
    if (!Number.isFinite(desde) || !Number.isFinite(hasta)) return ["'desde' y 'hasta' deben ser fechas válidas"];
    if (desde >= hasta) return ["'desde' debe ser anterior a 'hasta'"];
    if (hasta - desde > MAX_DAYS * DAY_MS) return [`El periodo no puede ser mayor a ${MAX_DAYS} días`];

    const proyectoId = text(query.proyecto) || undefined;
    const moduloId = text(query.modulo) || undefined;
    if (proyectoId && !UUID.test(proyectoId)) return ["'proyecto' no es válido"];
    if (moduloId && !UUID.test(moduloId)) return ["'modulo' no es válido"];

    const sujetoRaw = text(query.sujeto);
    if (sujetoRaw && !SUBJECTS.includes(sujetoRaw as ConnectionSubject)) return ["'sujeto' debe ser 'instalacion' o 'modulo'"];
    const sujeto = (sujetoRaw || undefined) as ConnectionSubject | undefined;

    const page = Math.max(1, Math.floor(Number(query.page)) || 1);
    const limit = Math.min(100, Math.max(1, Math.floor(Number(query.limit)) || 50));
    return [undefined, new ConnectionHistoryQueryDto(desde, hasta, page, limit, proyectoId, moduloId, sujeto)];
  }
}
