export type InstallationReviewPayload = {
  requestId: string;
  userId: string;
  userName: string;
  note?: string;
};

export type InstallationUnlinkPayload = {
  requestId: string;
  userId: string;
  userName: string;
  note?: string;
};

export interface LocalInstallationRecord {
  installationId: string;
  proyectoId: string;
  proyectoNombre: string;
  proyectoIdentificador: string;
  localApiBaseUrl: string;
  serverIp: string;
  serverMac: string;
  status: "pending" | "approved" | "rejected";
  lastCommandPollAt: number;
  updatedAt: number;
  [key: string]: unknown;
}

export interface InstallationConnectivitySummary {
  approved: number;
  online: number;
  degraded: number;
  offline: LocalInstallationRecord[];
}

export abstract class InstallationsDatasource {
  abstract findByInstallationId(installationId: string): Promise<LocalInstallationRecord | null>;
  abstract findApprovedByProyectoId(proyectoId: string): Promise<LocalInstallationRecord | null>;
  /** Hash of the project link token for an approved installation, or "" if there is none. */
  abstract findApprovedLinkTokenHash(installationId: string): Promise<string>;
  abstract recordCommandPoll(installationId: string, now: number): Promise<void>;
  /**
   * Approved installations grouped by last poll: online if polled at/after onlineSince,
   * degraded if between degradedSince and onlineSince, offline if before degradedSince.
   */
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
