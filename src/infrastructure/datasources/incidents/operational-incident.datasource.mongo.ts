import { OperationalIncidentModel } from "../../../data/mongo";
import {
  OperationalIncidentDatasource,
  OperationalIncidentFilters,
  OperationalIncidentInput,
  OperationalIncidentRecord,
} from "../../../domain/datasources/incidents/operational-incident.datasource";

const asRecord = (document: { toJSON(): unknown }) => document.toJSON() as OperationalIncidentRecord;

export class OperationalIncidentMongoDatasource extends OperationalIncidentDatasource {
  async open(input: OperationalIncidentInput, now: number): Promise<OperationalIncidentRecord> {
    const incident = await OperationalIncidentModel.findOneAndUpdate(
      { incidentKey: input.incidentKey },
      {
        $set: {
          status: "open",
          severity: input.severity,
          source: input.source,
          projectId: input.projectId ?? "",
          installationId: input.installationId ?? "",
          operationId: input.operationId ?? "",
          paymentId: input.paymentId ?? "",
          message: input.message,
          metadata: input.metadata,
          lastSeenAt: now,
          resolvedAt: undefined,
        },
        $setOnInsert: {
          incidentKey: input.incidentKey,
          type: input.type,
          openedAt: now,
        },
      },
      { upsert: true, new: true },
    );
    return asRecord(incident);
  }

  async resolve(incidentKey: string, now: number): Promise<OperationalIncidentRecord | null> {
    const incident = await OperationalIncidentModel.findOneAndUpdate(
      { incidentKey, status: "open" },
      { $set: { status: "resolved", resolvedAt: now, lastSeenAt: now } },
      { new: true },
    );
    return incident ? asRecord(incident) : null;
  }

  async list(filters: OperationalIncidentFilters, { page, limit }: { page: number; limit: number }) {
    const filter = {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.severity ? { severity: filters.severity } : {}),
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.projectId ? { projectId: filters.projectId } : {}),
      ...(filters.installationId ? { installationId: filters.installationId } : {}),
    };
    const [total, incidents] = await Promise.all([
      OperationalIncidentModel.countDocuments(filter),
      OperationalIncidentModel.find(filter)
        .sort({ lastSeenAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
    ]);
    return { total, incidents: incidents.map(asRecord) };
  }
}
