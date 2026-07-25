export type LocalProjectSnapshotPayload = {
  projectId: string;
  from?: string;
  to?: string;
};

export abstract class LocalProjectsDatasource {
  abstract getSnapshot(payload: LocalProjectSnapshotPayload): Promise<any>;
}
