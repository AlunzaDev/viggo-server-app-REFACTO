import type {
  InstallationUnlinkPayload,
  InstallationReviewPayload,
  InstallationsDatasource,
} from "../../datasources/installations/installations.datasource";

export abstract class InstallationsRepository {
  abstract getRequests(): Promise<any[]>;
  abstract approveRequest(payload: InstallationReviewPayload): Promise<any>;
  abstract rejectRequest(
    payload: InstallationReviewPayload & { note: string },
  ): Promise<any>;
  abstract unlinkTemporary(payload: InstallationUnlinkPayload): Promise<any>;
  abstract unlinkPermanent(payload: InstallationUnlinkPayload): Promise<any>;
}

export type InstallationsRepositoryDatasource = InstallationsDatasource;
