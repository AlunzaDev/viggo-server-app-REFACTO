import type {
  OperationalIncidentDatasource,
  OperationalIncidentFilters,
  OperationalIncidentInput,
} from "../../../domain/datasources/incidents/operational-incident.datasource";
import { OperationalIncidentRepository } from "../../../domain/repositories/incidents/operational-incident.repository";

export class OperationalIncidentRepositoryImpl implements OperationalIncidentRepository {
  constructor(private readonly datasource: OperationalIncidentDatasource) {}

  open(input: OperationalIncidentInput, now: number) {
    return this.datasource.open(input, now);
  }

  resolve(incidentKey: string, now: number) {
    return this.datasource.resolve(incidentKey, now);
  }

  list(filters: OperationalIncidentFilters, page: { page: number; limit: number }) {
    return this.datasource.list(filters, page);
  }
}
