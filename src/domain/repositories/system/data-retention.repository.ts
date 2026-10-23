import type { RetentionTarget } from "../../datasources/system/data-retention.datasource";

export abstract class DataRetentionRepository {
  abstract listProjectIds(): Promise<string[]>;
  abstract purgeBatch(target: RetentionTarget, before: number, limit: number, proyectoId?: string | null): Promise<number>;
}
