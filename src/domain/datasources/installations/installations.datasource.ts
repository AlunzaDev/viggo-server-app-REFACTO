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
  /**
   * The approved installation that owns this sync token (by hash), with its project. The
   * token replaced by the last rotation is accepted until the new one is used once.
   */
  abstract authenticateSyncToken(
    installationId: string,
    syncTokenHash: string,
  ): Promise<{ installationId: string; proyectoId: string; rotationRequested: boolean } | null>;
  /**
   * Issues a new sync token to the installation that authenticated with `usedHash`; that
   * hash stays valid until the new token is used. Null if it is no longer approved.
   */
  abstract rotateSyncToken(installationId: string, usedHash: string): Promise<{ syncToken: string } | null>;
  /** Asks the installation to rotate its token on its next sync call. */
  abstract requestSyncTokenRotation(requestId: string): Promise<LocalInstallationRecord | null>;
  /** Token to call the project's linked installation, or "" if it has none yet. */
  abstract findAdminCallToken(proyectoId: string): Promise<string>;
  abstract recordCommandPoll(installationId: string, now: number): Promise<void>;
  /** Every approved installation with the last time it asked for commands. */
  abstract listApprovedPresence(): Promise<Array<{ installationId: string; proyectoId: string; lastSeenAt: number | null }>>;
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
