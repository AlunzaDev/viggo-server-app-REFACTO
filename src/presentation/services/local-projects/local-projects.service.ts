import type {
  LocalDeviceBindingActionPayload,
  LocalProjectSnapshotPayload,
} from "../../../domain/datasources/local-projects/local-projects.datasource";
import { LocalProjectsRepository } from "../../../domain/repositories/local-projects/local-projects.repository";

export class LocalProjectsService {
  constructor(private readonly repository: LocalProjectsRepository) {}

  getSnapshot(payload: LocalProjectSnapshotPayload) {
    return this.repository.getSnapshot(payload);
  }

  getHeartbeat(projectId: string) {
    return this.repository.getHeartbeat(projectId);
  }

  approveDeviceBinding(payload: LocalDeviceBindingActionPayload) {
    return this.repository.approveDeviceBinding(payload);
  }

  rejectDeviceBinding(payload: LocalDeviceBindingActionPayload) {
    return this.repository.rejectDeviceBinding(payload);
  }
}
