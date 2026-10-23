import type { DataRetentionDatasource, RetentionTarget } from "../../../domain/datasources/system/data-retention.datasource";
import { DataRetentionRepository } from "../../../domain/repositories/system/data-retention.repository";

export class DataRetentionRepositoryImpl implements DataRetentionRepository {
  constructor(private readonly datasource: DataRetentionDatasource) {}

  listProjectIds() {
    return this.datasource.listProjectIds();
  }

  purgeBatch(target: RetentionTarget, before: number, limit: number, proyectoId?: string | null) {
    return this.datasource.purgeBatch(target, before, limit, proyectoId);
  }
}
