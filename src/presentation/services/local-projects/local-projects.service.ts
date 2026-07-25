import type { LocalProjectSnapshotPayload } from "../../../domain/datasources/local-projects/local-projects.datasource";
import { LocalProjectsRepository } from "../../../domain/repository/local-projects/local-projects.repository";

export class LocalProjectsService {
  constructor(private readonly repository: LocalProjectsRepository) {}

  getSnapshot(payload: LocalProjectSnapshotPayload) {
    return this.repository.getSnapshot(payload);
  }
}
