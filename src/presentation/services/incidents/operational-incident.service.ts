import type { OperationalIncidentInput } from "../../../domain/datasources/incidents/operational-incident.datasource";
import type { OperationalIncidentRepository } from "../../../domain/repositories/incidents/operational-incident.repository";
import { buildOperationalIncidentRepository } from "../../dependencies/repositories.dependencies";

// Static facade: incidents are opened/resolved from many places (sync, health,
// workers). The repository is built lazily so this module has no load-order needs.
export class OperationalIncidentService {
  private static repositoryInstance?: OperationalIncidentRepository;

  private static get repository(): OperationalIncidentRepository {
    return (this.repositoryInstance ??= buildOperationalIncidentRepository());
  }

  static async open(input: OperationalIncidentInput) {
    return this.repository.open(input, Date.now());
  }

  static async resolve(incidentKey: string) {
    return this.repository.resolve(incidentKey, Date.now());
  }
}
