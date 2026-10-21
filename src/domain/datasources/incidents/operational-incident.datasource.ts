export type OperationalIncidentType =
  | "INSTALLATION_OFFLINE"
  | "MOBILE_OPERATION_DEAD_LETTER"
  | "FINANCIAL_WORKER_FAILED"
  | "EXTERNAL_PAYMENT_REVIEW";

export type OperationalIncidentSeverity = "info" | "warning" | "critical";

export interface OperationalIncidentInput {
  incidentKey: string;
  type: OperationalIncidentType;
  severity: OperationalIncidentSeverity;
  source: string;
  projectId?: string;
  installationId?: string;
  operationId?: string;
  paymentId?: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface OperationalIncidentRecord {
  incidentKey: string;
  type: string;
  status: "open" | "resolved";
  severity: OperationalIncidentSeverity;
  source: string;
  projectId: string;
  installationId: string;
  operationId: string;
  paymentId: string;
  message: string;
  metadata?: Record<string, unknown>;
  openedAt: number;
  lastSeenAt: number;
  resolvedAt?: number;
}

export interface OperationalIncidentFilters {
  status?: string;
  severity?: string;
  type?: string;
  projectId?: string;
  /** Any of these parkings (the dashboard's scope). */
  projectIds?: string[];
  installationId?: string;
  /** Last seen within [seenFrom, seenTo). */
  seenFrom?: number;
  seenTo?: number;
}

export abstract class OperationalIncidentDatasource {
  /** Opens the incident, or refreshes it if it already exists. */
  abstract open(input: OperationalIncidentInput, now: number): Promise<OperationalIncidentRecord>;
  /** Resolves an open incident; returns null if it is not open. */
  abstract resolve(incidentKey: string, now: number): Promise<OperationalIncidentRecord | null>;
  abstract list(
    filters: OperationalIncidentFilters,
    page: { page: number; limit: number },
  ): Promise<{ total: number; incidents: OperationalIncidentRecord[] }>;
}
