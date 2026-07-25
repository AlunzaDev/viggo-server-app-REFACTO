import type { LocalProjectSnapshotPayload } from "../../datasources/local-projects/local-projects.datasource";

export abstract class LocalProjectsRepository {
  abstract getSnapshot(payload: LocalProjectSnapshotPayload): Promise<any>;
}
