import type {
  OperationalIncidentFilters,
  OperationalIncidentInput,
  OperationalIncidentRecord,
} from "../../datasources/incidents/operational-incident.datasource";

export abstract class OperationalIncidentRepository {
  abstract open(input: OperationalIncidentInput, now: number): Promise<OperationalIncidentRecord>;
  abstract resolve(incidentKey: string, now: number): Promise<OperationalIncidentRecord | null>;
  abstract list(
    filters: OperationalIncidentFilters,
    page: { page: number; limit: number },
  ): Promise<{ total: number; incidents: OperationalIncidentRecord[] }>;
}
