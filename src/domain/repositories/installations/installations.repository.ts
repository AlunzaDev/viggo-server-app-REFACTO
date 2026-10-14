import type {
  InstallationConnectivitySummary,
  InstallationUnlinkPayload,
  InstallationReviewPayload,
  InstallationsDatasource,
  LocalInstallationRecord,
} from "../../datasources/installations/installations.datasource";

export abstract class InstallationsRepository {
  abstract findByInstallationId(installationId: string): Promise<LocalInstallationRecord | null>;
  abstract findApprovedByProyectoId(proyectoId: string): Promise<LocalInstallationRecord | null>;
  /** The approved installation that owns this sync token (by hash), with its project. */
  abstract findApprovedBySyncTokenHash(
    installationId: string,
    syncTokenHash: string,
  ): Promise<{ installationId: string; proyectoId: string } | null>;
  abstract recordCommandPoll(installationId: string, now: number): Promise<void>;
  abstract getConnectivitySummary(
    onlineSince: number,
    degradedSince: number,
  ): Promise<InstallationConnectivitySummary>;

  abstract getRequests(): Promise<any[]>;
  abstract approveRequest(payload: InstallationReviewPayload): Promise<any>;
  abstract rejectRequest(
    payload: InstallationReviewPayload & { note: string },
  ): Promise<any>;
  abstract unlinkTemporary(payload: InstallationUnlinkPayload): Promise<any>;
  abstract unlinkPermanent(payload: InstallationUnlinkPayload): Promise<any>;
}

export type InstallationsRepositoryDatasource = InstallationsDatasource;
