import type {
  LocalProjectsDatasource,
  LocalProjectSnapshotPayload,
} from "../../../domain/datasources/local-projects/local-projects.datasource";
import { LocalProjectsRepository } from "../../../domain/repository/local-projects/local-projects.repository";

export class LocalProjectsRepositoryImpl implements LocalProjectsRepository {
  constructor(private readonly datasource: LocalProjectsDatasource) {}

  getSnapshot(payload: LocalProjectSnapshotPayload) {
    return this.datasource.getSnapshot(payload);
  }
}
