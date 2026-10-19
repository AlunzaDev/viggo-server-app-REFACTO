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
  abstract authenticateSyncToken(
    installationId: string,
    syncTokenHash: string,
  ): Promise<{ installationId: string; proyectoId: string; rotationRequested: boolean } | null>;
  abstract rotateSyncToken(installationId: string, usedHash: string): Promise<{ syncToken: string } | null>;
  abstract requestSyncTokenRotation(requestId: string): Promise<LocalInstallationRecord | null>;
  abstract findAdminCallToken(proyectoId: string): Promise<string>;
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
