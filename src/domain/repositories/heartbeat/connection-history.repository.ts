import type {
  ConnectionDowntime,
  ConnectionEventRecord,
  ConnectionHistoryFilters,
  InstallationChangeInput,
} from "../../datasources/heartbeat/connection-history.datasource";

export abstract class ConnectionHistoryRepository {
  abstract recordInstallationChange(input: InstallationChangeInput): Promise<void>;
  abstract list(filters: ConnectionHistoryFilters, page: { page: number; limit: number }): Promise<{ total: number; events: ConnectionEventRecord[] }>;
  abstract downtime(filters: ConnectionHistoryFilters, until: number): Promise<ConnectionDowntime[]>;
}
