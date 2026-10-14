import { PostgresDatabase } from "../../../data/postgres";
import { Prisma } from "../../../generated/prisma/client";
import type { LocalProjectSnapshotPayload } from "../../../domain/datasources/local-projects/local-projects.datasource";
import { isUuid } from "../postgres/prisma-errors";
import { toHeartbeatDocument } from "../sync/sync.documents.postgres";
import { LocalProjectsHttpDatasource, type LocalProjectsStore } from "./local-projects.http-datasource";

const asJson = (value: unknown) => value as Prisma.InputJsonValue;

const postgresStore: LocalProjectsStore = {
  async findProject(projectId) {
    if (!isUuid(projectId)) return null;
    const proyecto = await PostgresDatabase.client.proyecto.findUnique({
      where: { id: projectId },
      select: { id: true, nombre: true, identificador: true, localApiBaseUrl: true },
    });
    return proyecto ? { ...proyecto, localApiBaseUrl: proyecto.localApiBaseUrl.trim() } : null;
  },
  async findHeartbeat(projectId) {
    if (!isUuid(projectId)) return null;
    const row = await PostgresDatabase.client.projectHeartbeatSnapshot.findUnique({ where: { proyectoId: projectId } });
    return row ? toHeartbeatDocument(row) : null;
  },
  async saveHeartbeat(projectId, data) {
    const fields = {
      installationId: data.installationId,
      source: data.source,
      generatedAt: new Date(data.generatedAt),
      receivedAt: new Date(data.receivedAt),
      summary: asJson(data.summary),
      modules: asJson(data.modules),
      metadata: asJson(data.metadata),
    };
    const row = await PostgresDatabase.client.projectHeartbeatSnapshot.upsert({
      where: { proyectoId: projectId },
      create: { proyectoId: projectId, ...fields },
      update: fields,
    });
    return toHeartbeatDocument(row);
  },
};

export class LocalProjectsPostgresDatasource extends LocalProjectsHttpDatasource {
  /** Historical reports use durable cloud mirrors; no request to the parking is needed. */
  async getSnapshot(input: LocalProjectSnapshotPayload) {
    const project = await postgresStore.findProject(input.projectId);
    if (!project) return { status: "missing-project" as const };
    const now = Date.now();
    const number = (value: string | undefined, fallback: number) => value !== undefined && Number.isFinite(Number(value)) ? Number(value) : fallback;
    const a = number(input.from, now - 86_400_000), b = number(input.to, now);
    const from = Math.min(a, b), to = Math.max(a, b);
    const db = PostgresDatabase.client;
    const range = (table: string, field: string) => Prisma.sql`
      FROM ${Prisma.raw(table)} WHERE proyecto_id = ${input.projectId}::uuid
      AND (payload->>${field})::timestamptz BETWEEN ${new Date(from)} AND ${new Date(to)}`;
    const group = async (table: string, date: string, key: string, amounts: Record<string, string>) => {
      const columns = Object.entries(amounts).map(([alias, field]) => Prisma.sql`COALESCE(SUM((payload->>${field})::numeric),0)::float8 AS ${Prisma.raw(alias)}`);
      return db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        SELECT payload->>${key} AS "_id", count(*)::int AS count, ${Prisma.join(columns)}
        ${range(table, date)} GROUP BY 1`);
    };
    const toReportEntity = (payload: Record<string, unknown>) => {
        const entity: Record<string, unknown> = { _id: payload.id };
        for (const [key, value] of Object.entries(payload)) {
          const name = key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
          entity[name] = typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) ? Date.parse(value) : value;
        }
        // Monetary JSON values are strings in PostgreSQL snapshots.
        for (const key of ["monto", "amount", "amountExpected", "amountReceived", "changeAmount", "openingAmount", "closingAmountExpected", "closingAmountCounted", "differenceAmount"]) {
          if (entity[key] !== undefined && entity[key] !== null) entity[key] = Number(entity[key]);
        }
        if ("hora_inicio" in payload) {
          entity.proyecto = payload.proyecto_id;
          entity.entrada = payload.entrada_id;
          entity.usuario = payload.usuario_id;
          entity.salida = payload.salida_id ?? undefined;
          for (const name of ["horaConsulta", "horaCobro", "horaSalida", "barrierOpenedAt", "barrierConfirmedAt", "fraudDetectedAt"]) {
            if (entity[name] === null || entity[name] === undefined) entity[name] = -1;
          }
        }
        return entity;
    };
    const recent = async (table: string, date: string) => {
      const rows = await db.$queryRaw<Array<{ payload: Record<string, unknown> }>>(Prisma.sql`
        SELECT payload ${range(table, date)} ORDER BY (payload->>${date})::timestamptz DESC, aggregate_id LIMIT 50`);
      return rows.map(({ payload }) => {
        return toReportEntity(payload);
      });
    };
    const [tickets, payments, cashSessions, cashMovements, recentTickets, recentSessions, recentMovements, shifts] = await Promise.all([
      db.$queryRaw<Array<{ total: number; paid: number; amount: number }>>(Prisma.sql`
        SELECT count(*)::int AS total, count(*) FILTER (WHERE (payload->>'pagado')::boolean)::int AS paid,
          COALESCE(sum((payload->>'monto')::numeric),0)::float8 AS amount ${range("operational_tickets", "hora_inicio")}`),
      group("operational_payments", "paid_at", "status", { amount: "amount" }),
      group("operational_cash_payment_sessions", "started_at", "status", { expected: "amount_expected", received: "amount_received", change: "change_amount" }),
      group("operational_cash_register_movements", "created_at", "direction", { amount: "amount" }),
      recent("operational_tickets", "hora_inicio"), recent("operational_cash_payment_sessions", "started_at"),
      recent("operational_cash_register_movements", "created_at"),
      db.operationalCashShift.findMany({ where: { proyectoId: input.projectId, payload: { path: ["status"], equals: "open" } }, take: 50, orderBy: { occurredAt: "desc" } }),
    ]);
    const totals = tickets[0];
    return { status: "ok" as const, project, snapshot: {
      mode: "cloud-history", generatedAt: now, range: { from, to },
      summary: { tickets: { ...totals, unpaid: totals.total - totals.paid }, payments, cashSessions, cashMovements, openShifts: shifts.length },
      openShifts: shifts.map(row => toReportEntity(row.payload as Record<string, unknown>)),
      recent: { tickets: recentTickets, cashSessions: recentSessions, cashMovements: recentMovements },
    } };
  }

  constructor() {
    super(postgresStore);
  }
}
