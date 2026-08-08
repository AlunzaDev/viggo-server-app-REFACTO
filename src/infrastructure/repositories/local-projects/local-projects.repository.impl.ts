import type {
  LocalDeviceBindingActionPayload,
  LocalProjectsDatasource,
  LocalProjectSnapshotPayload,
} from "../../../domain/datasources/local-projects/local-projects.datasource";
import { LocalProjectsRepository } from "../../../domain/repository/local-projects/local-projects.repository";

export class LocalProjectsRepositoryImpl implements LocalProjectsRepository {
  constructor(private readonly datasource: LocalProjectsDatasource) {}

  getSnapshot(payload: LocalProjectSnapshotPayload) {
    return this.datasource.getSnapshot(payload);
  }

  getHeartbeat(projectId: string) {
    return this.datasource.getHeartbeat(projectId);
  }

  approveDeviceBinding(payload: LocalDeviceBindingActionPayload) {
    return this.datasource.approveDeviceBinding(payload);
  }

  rejectDeviceBinding(payload: LocalDeviceBindingActionPayload) {
    return this.datasource.rejectDeviceBinding(payload);
  }
}
