import { OperationalIncidentRepository } from "../../../domain/repositories/incidents/operational-incident.repository";
import type { MetricId } from "../../../domain/statistics/catalog";
import type { MetricResult, StatisticsQuery } from "../../../domain/statistics/statistics";
import { StatisticsService } from "../statistics/statistics.service";

type Range = { rango: string; tickets: number; ingresos: string };
type Stay = { tickets: number; promedioMinutos: number; medianaMinutos: number; rangos: Range[] };
type Connectivity = { proyectoId: string; nombre: string; ciudad: string; estado: string; ultimoContacto: number | null; dispositivos: number; dispositivosActivos: number };

const RANGE_COLORS: Record<string, string> = { "< 1 Hora": "#94a3b8", "1 - 3 Horas": "#3b82f6", "3 - 8 Horas": "#10b981", "8+ Horas": "#8b5cf6" };
const METHOD_LABEL: Record<string, string> = { efectivo: "Efectivo", tarjeta: "Tarjeta", sin_identificar: "Sin identificar" };
const HEALTH: Record<string, string> = { en_linea: "online", intermitente: "warning", desconectada: "offline", sin_vincular: "unlinked" };
const money = (value: unknown) => Number(value ?? 0);
const change = (current: number, previous: number) => (previous > 0 ? Math.round(((current - previous) / previous) * 1000) / 10 : null);

/**
 * The dashboard's response, built from the statistics catalog (docs/estadisticas.md): every
 * figure is aggregated in PostgreSQL, none is summed in Node from raw rows.
 */
export class DashboardService {
  constructor(
    private readonly statistics: StatisticsService,
    private readonly incidents: OperationalIncidentRepository,
  ) {}

  async getMetrics(projectIds: string[], from: number, to: number, now = Date.now()) {
    const base: Omit<StatisticsQuery, "metricas" | "agrupar"> = { proyectos: projectIds, rango: { kind: "instants", from, to }, comparar: false };
    const results: MetricResult[] = [];
    const metric = async (id: MetricId, agrupar: StatisticsQuery["agrupar"] = null, comparar = false): Promise<MetricResult> => {
      const result = (await this.statistics.run({ ...base, metricas: [id], agrupar, comparar }, now, { coverage: false })).metricas[0];
      results.push(result);
      return result;
    };

    const net = await metric("ingresos.netos", null, true);
    const byMethod = await metric("ingresos.netos", "metodo");
    const byDay = await metric("ingresos.netos", "dia");
    const entries = await metric("tickets.entradas", "hora");
    const exits = await metric("tickets.salidas", "hora");
    const average = await metric("tickets.ticket_promedio");
    const stay = await metric("tickets.estancia");
    const active = await metric("pensiones.vigentes");
    const expiring = await metric("pensiones.por_vencer");
    const health = await metric("operacion.conectividad");
    const inside = await metric("operacion.autos_dentro");
    const occupancy = await metric("operacion.ocupacion");

    const total = money(net.valor);
    const stays = stay.estado === "ok" ? (stay.valor as Stay) : null;
    const stayRevenue = stays ? stays.rangos.reduce((sum, range) => sum + money(range.ingresos), 0) : 0;
    const hourly = new Map<string, { hourLabel: string; entries: number; exits: number }>();
    for (const [series, field] of [[entries.serie ?? [], "entries"], [exits.serie ?? [], "exits"]] as const) {
      for (const point of series) {
        const row = hourly.get(point.clave) ?? { hourLabel: point.clave, entries: 0, exits: 0 };
        row[field] = Number(point.valor);
        hourly.set(point.clave, row);
      }
    }
    const { incidents } = await this.incidents.list({ projectIds, seenFrom: from, seenTo: to }, { page: 1, limit: 20 });
    const projects = (health.valor as Connectivity[] | null) ?? [];
    const coverage = (await this.statistics.run({ ...base, metricas: [], agrupar: null }, now)).cobertura;
    const methods = (byMethod.serie ?? []).filter((point) => money(point.valor) !== 0);

    return {
      totalRevenue: total,
      revenueChangePercent: change(total, money(net.anterior)),
      activePensionsCount: Number(active.valor ?? 0),
      pensionsExpiringSoonCount: Number(expiring.valor ?? 0),
      avgStayDurationLabel: stays ? `${Math.floor(stays.promedioMinutos / 60)}h ${stays.promedioMinutos % 60}m` : "Sin datos",
      avgTicketRevenue: average.estado === "ok" ? money(average.valor) : null,
      avgTicketChangePercent: null,
      // Only parkings with a captured capacity (#54): never a made-up percentage.
      occupancyPercent: occupancy.estado === "ok" ? Number(occupancy.valor) : null,
      carsInside: inside.estado === "ok" ? Number(inside.valor) : null,
      stayRangesBreakdown: stays ? stays.rangos.map((range) => ({
        rangeLabel: range.rango, count: range.tickets, revenue: money(range.ingresos),
        percentage: stayRevenue > 0 ? Math.round((money(range.ingresos) / stayRevenue) * 1000) / 10 : 0, color: RANGE_COLORS[range.rango],
      })) : [],
      paymentMethods: methods.map((point, index) => ({
        method: METHOD_LABEL[point.clave] ?? point.clave, amount: money(point.valor),
        percentage: total ? Math.round((money(point.valor) / total) * 1000) / 10 : 0, color: ["#10b981", "#3b82f6", "#8b5cf6"][index % 3],
      })),
      revenueTrend: (byDay.serie ?? []).map((point) => ({ label: point.clave, amount: money(point.valor) })),
      hourlyPeaks: [...hourly.values()].sort((a, b) => a.hourLabel.localeCompare(b.hourLabel)),
      healthProjects: projects.map((project) => ({
        id: project.proyectoId, name: project.nombre, city: project.ciudad, status: HEALTH[project.estado], lastHeartbeatAt: project.ultimoContacto,
        activeDevicesCount: project.dispositivosActivos, totalDevicesCount: project.dispositivos,
      })),
      auditEvents: incidents.map((incident) => ({
        id: incident.incidentKey, title: incident.status === "resolved" ? "Incidencia resuelta" : "Incidencia operativa", description: incident.message,
        timestamp: new Date(incident.lastSeenAt).toISOString(),
        severity: incident.status === "resolved" ? "success" : incident.severity === "critical" ? "error" : incident.severity,
        category: "system", location: projects.find((project) => project.proyectoId === incident.projectId)?.nombre,
      })),
      // A figure never passes for complete: which metrics failed and which parkings are behind.
      partial: results.some((result) => result.estado === "error"),
      failedMetrics: results.filter((result) => result.estado === "error").map((result) => result.id),
      coverage: coverage.map((item) => ({
        projectId: item.proyectoId, name: projects.find((project) => project.proyectoId === item.proyectoId)?.nombre ?? "",
        timeZone: item.zonaHoraria, lastDataAt: item.ultimoDato, stale: item.desactualizada,
      })),
      mixedTimeZones: new Set(coverage.map((item) => item.zonaHoraria)).size > 1,
      generatedAt: now, range: { from, to }, currency: "MXN",
    };
  }
}
