import { PostgresDatabase } from "../../../data/postgres";
import { Prisma } from "../../../generated/prisma/client";

const epoch = (value: unknown): number | null => {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Date.parse(String(value));
  return Number.isFinite(n) && n > 0 ? n : null;
};
const day = (value: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
const hour = (value: number) => new Intl.DateTimeFormat("en-GB", { timeZone: "America/Mexico_City", hour: "2-digit", hourCycle: "h23" }).format(value) + ":00";
const money = (cents: number) => Math.round(cents) / 100;
const change = (current: number, previous: number) => previous > 0 ? Math.round((current - previous) / previous * 1000) / 10 : null;
type Payload = Record<string, unknown>;

export class DashboardPostgresDatasource {
  async getMetrics(projectIds: string[], from: number, to: number, now = Date.now()) {
    const previousFrom = from - (to - from);
    // One consistent database snapshot for money, tickets and current project state.
    return PostgresDatabase.client.$transaction(async tx => {
      // Fetch relations sequentially: Prisma's relation includes may issue parallel
      // queries on an interactive transaction's single pg connection.
      const projectRows = await tx.proyecto.findMany({ where: { id: { in: projectIds } }, orderBy: { nombre: "asc" } });
      const installationRows = await tx.localInstallation.findMany({ where: { proyectoId: { in: projectIds }, status: "approved" } });
      const heartbeatRows = await tx.projectHeartbeatSnapshot.findMany({ where: { proyectoId: { in: projectIds } } });
      const moduleRows = await tx.modulo.findMany({ where: { proyectoId: { in: projectIds } } });
      const deviceRows = await tx.moduloDeviceState.findMany({ where: { moduloId: { in: moduleRows.map(m=>m.id) } } });
      const projects = projectRows.map(p=>({...p,
        installations:installationRows.filter(i=>i.proyectoId===p.id),
        heartbeatSnapshot:heartbeatRows.find(h=>h.proyectoId===p.id),
        modulos:moduleRows.filter(m=>m.proyectoId===p.id).map(m=>({...m,deviceState:deviceRows.find(d=>d.moduloId===m.id)})),
      }));
      const plans = await tx.pension.findMany({ where: { proyectoId: { in: projectIds } }, select: { id:true,proyectoId:true } });
      const passRows = await tx.pensionPass.findMany({ where: { pensionId: { in: plans.map(p=>p.id) } } });
      const passes = passRows.map(p=>({...p,pension:{proyectoId:plans.find(plan=>plan.id===p.pensionId)!.proyectoId}}));
      const cloudPayments = await tx.payment.findMany({ where: {
        paidAt: { gte: new Date(previousFrom), lt: new Date(to) },
        OR: [{ proyectoId: { in: projectIds } }, { referenceType: { in: ["pension", "renewal"] }, referenceId: { in: passes.map(p => p.id) } }],
      } });
      const operationalPayments = projectIds.length ? await tx.$queryRaw<Array<{ proyecto_id: string; installation_id: string; aggregate_id: string; payload: Payload }>>(Prisma.sql`
        SELECT proyecto_id, installation_id, aggregate_id, payload FROM operational_payments
        WHERE proyecto_id IN (${Prisma.join(projectIds.map(id => Prisma.sql`${id}::uuid`))})
          AND (payload->>'paid_at')::timestamptz >= ${new Date(previousFrom)}
          AND (payload->>'paid_at')::timestamptz < ${new Date(to)}`) : [];
      const tickets = projectIds.length ? await tx.$queryRaw<Array<{ payload: Payload }>>(Prisma.sql`
        SELECT payload FROM operational_tickets
        WHERE proyecto_id IN (${Prisma.join(projectIds.map(id => Prisma.sql`${id}::uuid`))})
        AND (((payload->>'hora_inicio')::timestamptz >= ${new Date(previousFrom)} AND (payload->>'hora_inicio')::timestamptz < ${new Date(to)})
          OR ((payload->>'hora_salida')::timestamptz >= ${new Date(previousFrom)} AND (payload->>'hora_salida')::timestamptz < ${new Date(to)}))`) : [];
      const incidents = await tx.operationalIncident.findMany({ where: { proyectoId: { in: projectIds }, lastSeenAt: { gte: new Date(from), lt: new Date(to) } }, orderBy: { lastSeenAt: "desc" }, take: 20 });

      const payments = new Map<string, { amount: number; paidAt: number; status: string; method: string; currency: string }>();
      for (const row of operationalPayments) {
        const p = row.payload;
        const reference = String(p.provider_reference ?? "");
        payments.set(reference ? `${row.proyecto_id}:${reference}` : `${row.installation_id}:${row.aggregate_id}`, {
          amount: Math.round(Number(p.amount) * 100), paidAt: epoch(p.paid_at) ?? 0, status: String(p.status), currency: String(p.currency ?? "").toUpperCase(),
          method: reference.startsWith("pos_session_") || p.raw_provider_status === "cash" ? "Efectivo" : reference.startsWith("pi_") ? "Tarjeta" : "Sin identificar",
        });
      }
      // Cloud Stripe records override their operational mirror, including refunds.
      for (const p of cloudPayments) {
        const projectId = p.proyectoId ?? passes.find(pass => pass.id === p.referenceId)?.pension.proyectoId;
        const key = p.stripePaymentIntentId ? `${projectId}:${p.stripePaymentIntentId}` : `cloud:${p.id}`;
        payments.set(key, { amount: Math.round(p.amount.toNumber() * 100), paidAt: p.paidAt.getTime(), status: p.status, currency: p.currency.toUpperCase(), method: p.stripePaymentIntentId ? "Tarjeta" : "Sin identificar" });
      }
      const succeeded = [...payments.values()].filter(p => p.status === "succeeded" && p.currency === "MXN");
      const current = succeeded.filter(p => p.paidAt >= from && p.paidAt < to);
      const previous = succeeded.filter(p => p.paidAt >= previousFrom && p.paidAt < from);
      const total = current.reduce((sum, p) => sum + p.amount, 0);
      const previousTotal = previous.reduce((sum, p) => sum + p.amount, 0);
      const methodTotals = new Map<string, number>();
      const trend = new Map<string, number>();
      for (const p of current) {
        methodTotals.set(p.method, (methodTotals.get(p.method) ?? 0) + p.amount);
        const label = day(p.paidAt); trend.set(label, (trend.get(label) ?? 0) + p.amount);
      }
      const exited = tickets.map(row => row.payload).filter(p => {
        const exit = epoch(p.hora_salida); return exit !== null && exit >= from && exit < to;
      });
      const paidExits = exited.filter(p => p.pagado === true);
      const durations = exited.flatMap(p => {
        const entry = epoch(p.hora_inicio), exit = epoch(p.hora_salida);
        return entry !== null && exit !== null && exit >= entry ? [(exit - entry) / 60_000] : [];
      });
      const avgDuration = durations.length ? Math.round(durations.reduce((a,b) => a+b, 0) / durations.length) : null;
      const ranges = [
        { label: "< 1 Hora", min: 0, max: 60, color: "#94a3b8" },
        { label: "1 - 3 Horas", min: 60, max: 180, color: "#3b82f6" },
        { label: "3 - 8 Horas", min: 180, max: 480, color: "#10b981" },
        { label: "8+ Horas", min: 480, max: Infinity, color: "#8b5cf6" },
      ].map(range => {
        const rows = paidExits.filter(p => {
          const entry = epoch(p.hora_inicio), exit = epoch(p.hora_salida);
          const minutes = entry !== null && exit !== null ? (exit-entry)/60_000 : -1;
          return minutes >= range.min && minutes < range.max;
        });
        return { rangeLabel: range.label, count: rows.length, revenue: money(rows.reduce((s,p) => s + Math.round(Number(p.monto ?? 0)*100),0)), percentage: 0, color: range.color };
      });
      const stayRevenue = ranges.reduce((sum,r) => sum+r.revenue,0);
      for (const r of ranges) r.percentage = stayRevenue > 0 ? Math.round(r.revenue/stayRevenue*1000)/10 : 0;
      const hourly = new Map<string, { hourLabel: string; entries: number; exits: number }>();
      for (const {payload: p} of tickets) for (const [field, metric] of [["hora_inicio", "entries"], ["hora_salida", "exits"]] as const) {
        const timestamp = epoch(p[field]);
        if (timestamp === null || timestamp < from || timestamp >= to) continue;
        const label = hour(timestamp), point = hourly.get(label) ?? { hourLabel: label, entries: 0, exits: 0 };
        point[metric]++; hourly.set(label,point);
      }
      const active = passes.filter(p => p.estado && p.vigent && p.usuarioId !== null && p.validFrom !== null && p.validFrom.getTime() <= now && p.validTo !== null && p.validTo.getTime() > now);
      const healthProjects = projects.map(p => {
        const poll = Math.max(0,...p.installations.map(i => i.lastCommandPollAt?.getTime() ?? 0));
        const beat = p.heartbeatSnapshot ? Math.min(p.heartbeatSnapshot.generatedAt.getTime(),p.heartbeatSnapshot.receivedAt.getTime()) : 0;
        const last = Math.max(poll,beat), age = last ? now-last : Infinity;
        const status = !p.installations.length ? "unlinked" : age <= 15_000 ? "online" : age <= 60_000 ? "warning" : "offline";
        return { id:p.id, name:p.nombre, city:p.ciudad, status, lastHeartbeatAt:last || null,
          activeDevicesCount: status === "online" ? p.modulos.filter(m => m.deviceState?.isConnected && m.deviceState.isAuthorized && m.deviceState.lastHeartbeatAt && now-m.deviceState.lastHeartbeatAt.getTime()<=60_000).length : 0,
          totalDevicesCount:p.modulos.length };
      });
      return {
        totalRevenue:money(total), revenueChangePercent:change(total,previousTotal),
        activePensionsCount:active.length, pensionsExpiringSoonCount:active.filter(p => p.validTo!.getTime() <= now+7*86_400_000).length,
        avgStayDurationLabel:avgDuration === null ? "Sin datos" : `${Math.floor(avgDuration/60)}h ${avgDuration%60}m`,
        avgTicketRevenue:paidExits.length ? money(paidExits.reduce((s,p)=>s+Math.round(Number(p.monto ?? 0)*100),0)/paidExits.length) : null,
        avgTicketChangePercent:null, occupancyPercent:null,
        stayRangesBreakdown:exited.length ? ranges : [],
        paymentMethods:[...methodTotals].map(([method,amount],index)=>({ method,amount:money(amount),percentage:total ? Math.round(amount/total*1000)/10 : 0,color:["#10b981","#3b82f6","#8b5cf6"][index%3] })),
        revenueTrend:[...trend].sort(([a],[b])=>a.localeCompare(b)).map(([label,amount])=>({label,amount:money(amount)})),
        hourlyPeaks:[...hourly.values()].sort((a,b)=>a.hourLabel.localeCompare(b.hourLabel)),
        healthProjects,
        auditEvents:incidents.map(i=>({id:i.incidentKey,title:i.status === "resolved" ? "Incidencia resuelta" : "Incidencia operativa",description:i.message,timestamp:new Date(i.lastSeenAt).toISOString(),severity:i.status === "resolved" ? "success" : i.severity === "critical" ? "error" : i.severity,category:"system",location:projects.find(p=>p.id===i.proyectoId)?.nombre})),
        generatedAt:now, range:{from,to}, currency:"MXN", timeZone:"America/Mexico_City",
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
}
