import { OperationalIncidentModel } from "../../../data/mongo";

type IncidentInput = {
  incidentKey: string;
  type: "INSTALLATION_OFFLINE" | "MOBILE_OPERATION_DEAD_LETTER" | "FINANCIAL_WORKER_FAILED";
  severity: "info" | "warning" | "critical";
  source: string;
  projectId?: string;
  installationId?: string;
  operationId?: string;
  paymentId?: string;
  message: string;
  metadata?: Record<string, unknown>;
};

export class OperationalIncidentService {
  static async open(input: IncidentInput) {
    const now = Date.now();
    return OperationalIncidentModel.findOneAndUpdate(
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
  }

  static async resolve(incidentKey: string) {
    const now = Date.now();
    return OperationalIncidentModel.findOneAndUpdate(
      { incidentKey, status: "open" },
      { $set: { status: "resolved", resolvedAt: now, lastSeenAt: now } },
      { new: true },
    );
  }
}
