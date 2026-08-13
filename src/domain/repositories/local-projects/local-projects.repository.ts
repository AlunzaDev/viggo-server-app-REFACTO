import type {
  LocalDeviceBindingActionPayload,
  LocalProjectSnapshotPayload,
} from "../../datasources/local-projects/local-projects.datasource";

export abstract class LocalProjectsRepository {
  abstract getSnapshot(payload: LocalProjectSnapshotPayload): Promise<any>;
  abstract getHeartbeat(projectId: string): Promise<any>;
  abstract approveDeviceBinding(payload: LocalDeviceBindingActionPayload): Promise<any>;
  abstract rejectDeviceBinding(payload: LocalDeviceBindingActionPayload): Promise<any>;
}
