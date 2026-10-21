import { isUuid } from "../../helpers/uuid";

const MAX_RANGE_MS = 366 * 86_400_000;

/** The dashboard's period (instants in ms, up to 366 days) and its parking, or all of them. */
export class DashboardQueryDto {
  private constructor(
    public readonly from: number,
    public readonly to: number,
    /** null: every parking the user can see. */
    public readonly projectId: string | null,
  ) {}

  static create(query: Record<string, unknown>): [string?, DashboardQueryDto?] {
    const from = Number(query.from), to = Number(query.to);
    if (!Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to <= from || to - from > MAX_RANGE_MS || !Number.isFinite(new Date(to).getTime())) {
      return ["Selecciona un período válido de hasta 366 días"];
    }
    const selected = String(query.projectId ?? "all");
    if (selected !== "all" && !isUuid(selected)) return ["Proyecto inválido"];
    return [undefined, new DashboardQueryDto(from, to, selected === "all" ? null : selected)];
  }
}
