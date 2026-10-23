import type {
  ConnectionHistoryDatasource,
  ConnectionHistoryFilters,
  InstallationChangeInput,
} from "../../../domain/datasources/heartbeat/connection-history.datasource";
import { ConnectionHistoryRepository } from "../../../domain/repositories/heartbeat/connection-history.repository";

export class ConnectionHistoryRepositoryImpl implements ConnectionHistoryRepository {
  constructor(private readonly datasource: ConnectionHistoryDatasource) {}

  recordInstallationChange(input: InstallationChangeInput) {
    return this.datasource.recordInstallationChange(input);
  }

  list(filters: ConnectionHistoryFilters, page: { page: number; limit: number }) {
    return this.datasource.list(filters, page);
  }

  downtime(filters: ConnectionHistoryFilters, until: number) {
    return this.datasource.downtime(filters, until);
  }
}
