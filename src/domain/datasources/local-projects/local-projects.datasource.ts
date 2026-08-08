export type LocalProjectSnapshotPayload = {
  projectId: string;
  from?: string;
  to?: string;
};

export type LocalDeviceBindingActionPayload = {
  projectId: string;
  moduleId: string;
  fingerprint?: string;
  resolvedByUserId?: string;
  resolvedByUserName?: string;
  notes?: string;
};

export abstract class LocalProjectsDatasource {
  abstract getSnapshot(payload: LocalProjectSnapshotPayload): Promise<any>;
  abstract getHeartbeat(projectId: string): Promise<any>;
  abstract approveDeviceBinding(payload: LocalDeviceBindingActionPayload): Promise<any>;
  abstract rejectDeviceBinding(payload: LocalDeviceBindingActionPayload): Promise<any>;
}
