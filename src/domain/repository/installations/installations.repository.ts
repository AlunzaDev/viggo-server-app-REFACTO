import type {
  InstallationReviewPayload,
  InstallationsDatasource,
} from "../../datasources/installations/installations.datasource";

export abstract class InstallationsRepository {
  abstract getRequests(): Promise<any[]>;
  abstract approveRequest(payload: InstallationReviewPayload): Promise<any>;
  abstract rejectRequest(
    payload: InstallationReviewPayload & { note: string },
  ): Promise<any>;
}

export type InstallationsRepositoryDatasource = InstallationsDatasource;
