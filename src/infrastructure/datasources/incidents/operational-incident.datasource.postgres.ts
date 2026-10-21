import { PostgresDatabase } from "../../../data/postgres";
import { Prisma, type OperationalIncident } from "../../../generated/prisma/client";
import {
  OperationalIncidentDatasource,
  type OperationalIncidentFilters,
  type OperationalIncidentInput,
  type OperationalIncidentRecord,
} from "../../../domain/datasources/incidents/operational-incident.datasource";
import { isUuid } from "../postgres/prisma-errors";

const TYPES = ["INSTALLATION_OFFLINE", "MOBILE_OPERATION_DEAD_LETTER", "FINANCIAL_WORKER_FAILED", "EXTERNAL_PAYMENT_REVIEW"];
const STATUSES = ["open", "resolved"];
const SEVERITIES = ["info", "warning", "critical"];

const toRecord = (row: OperationalIncident): OperationalIncidentRecord => ({
  incidentKey: row.incidentKey,
  type: row.type,
  status: row.status,
  severity: row.severity,
  source: row.source,
  projectId: row.proyectoId ?? "",
  installationId: row.installationId,
  operationId: row.operationId,
  paymentId: row.paymentId,
  message: row.message,
  metadata: (row.metadata as Record<string, unknown> | null) ?? undefined,
  openedAt: row.openedAt.getTime(),
  lastSeenAt: row.lastSeenAt.getTime(),
  resolvedAt: row.resolvedAt?.getTime(),
});

export class OperationalIncidentPostgresDatasource extends OperationalIncidentDatasource {
  private get incidents() {
    return PostgresDatabase.client.operationalIncident;
  }

  async open(input: OperationalIncidentInput, now: number): Promise<OperationalIncidentRecord> {
    const write = (proyectoId: string | null) => {
      const fields = {
        status: "open" as const,
        severity: input.severity,
        source: input.source,
        proyectoId,
        installationId: input.installationId ?? "",
        operationId: input.operationId ?? "",
        paymentId: input.paymentId ?? "",
        message: input.message,
        // Undefined keeps the previous metadata, as the Mongo $set did.
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
        lastSeenAt: new Date(now),
        resolvedAt: null,
      };
      return this.incidents.upsert({
        where: { incidentKey: input.incidentKey },
        create: { incidentKey: input.incidentKey, type: input.type, openedAt: new Date(now), ...fields },
        update: fields,
      });
    };

    const proyectoId = isUuid(input.projectId) ? input.projectId : null;
    try {
      return toRecord(await write(proyectoId));
    } catch (error) {
      // The project may not exist (or was deleted): keep the incident without the link.
      if (proyectoId && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        return toRecord(await write(null));
      }
      throw error;
    }
  }

  async resolve(incidentKey: string, now: number): Promise<OperationalIncidentRecord | null> {
    const { count } = await this.incidents.updateMany({
      where: { incidentKey, status: "open" },
      data: { status: "resolved", resolvedAt: new Date(now), lastSeenAt: new Date(now) },
    });
    if (!count) return null;
    return toRecord(await this.incidents.findUniqueOrThrow({ where: { incidentKey } }));
  }

  async list(filters: OperationalIncidentFilters, { page, limit }: { page: number; limit: number }) {
    const invalid =
      (filters.type && !TYPES.includes(filters.type)) ||
      (filters.status && !STATUSES.includes(filters.status)) ||
      (filters.severity && !SEVERITIES.includes(filters.severity)) ||
      (filters.projectId && !isUuid(filters.projectId)) ||
      (filters.projectIds && !filters.projectIds.every(isUuid));
    if (filters.projectIds && !filters.projectIds.length) return { total: 0, incidents: [] };
    if (invalid) return { total: 0, incidents: [] };

    const where: Prisma.OperationalIncidentWhereInput = {
      ...(filters.status ? { status: filters.status as "open" | "resolved" } : {}),
      ...(filters.severity ? { severity: filters.severity as "info" | "warning" | "critical" } : {}),
      ...(filters.type ? { type: filters.type as OperationalIncident["type"] } : {}),
      ...(filters.projectId ? { proyectoId: filters.projectId } : {}),
      ...(filters.projectIds ? { proyectoId: { in: filters.projectIds } } : {}),
      ...(filters.seenFrom !== undefined || filters.seenTo !== undefined ? { lastSeenAt: {
        ...(filters.seenFrom !== undefined ? { gte: new Date(filters.seenFrom) } : {}),
        ...(filters.seenTo !== undefined ? { lt: new Date(filters.seenTo) } : {}),
      } } : {}),
      ...(filters.installationId ? { installationId: filters.installationId } : {}),
    };
    const [total, rows] = await Promise.all([
      this.incidents.count({ where }),
      this.incidents.findMany({ where, orderBy: { lastSeenAt: "desc" }, skip: (page - 1) * limit, take: limit }),
    ]);
    return { total, incidents: rows.map(toRecord) };
  }
}
