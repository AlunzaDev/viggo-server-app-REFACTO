import type {
  InstallationUnlinkPayload,
  InstallationReviewPayload,
  InstallationsDatasource,
} from "../../../domain/datasources/installations/installations.datasource";
import { InstallationsRepository } from "../../../domain/repositories/installations/installations.repository";

export class InstallationsRepositoryImpl implements InstallationsRepository {
  constructor(private readonly datasource: InstallationsDatasource) {}

  findByInstallationId(installationId: string) {
    return this.datasource.findByInstallationId(installationId);
  }

  findApprovedByProyectoId(proyectoId: string) {
    return this.datasource.findApprovedByProyectoId(proyectoId);
  }

  authenticateSyncToken(installationId: string, syncTokenHash: string) {
    return this.datasource.authenticateSyncToken(installationId, syncTokenHash);
  }

  rotateSyncToken(installationId: string, usedHash: string) {
    return this.datasource.rotateSyncToken(installationId, usedHash);
  }

  requestSyncTokenRotation(requestId: string) {
    return this.datasource.requestSyncTokenRotation(requestId);
  }

  findAdminCallToken(proyectoId: string) {
    return this.datasource.findAdminCallToken(proyectoId);
  }

  recordCommandPoll(installationId: string, now: number) {
    return this.datasource.recordCommandPoll(installationId, now);
  }

  getConnectivitySummary(onlineSince: number, degradedSince: number) {
    return this.datasource.getConnectivitySummary(onlineSince, degradedSince);
  }

  getRequests() {
    return this.datasource.getRequests();
  }

  approveRequest(payload: InstallationReviewPayload) {
    return this.datasource.approveRequest(payload);
  }

  rejectRequest(payload: InstallationReviewPayload & { note: string }) {
    return this.datasource.rejectRequest(payload);
  }

  unlinkTemporary(payload: InstallationUnlinkPayload) {
    return this.datasource.unlinkTemporary(payload);
  }

  unlinkPermanent(payload: InstallationUnlinkPayload) {
    return this.datasource.unlinkPermanent(payload);
  }
}
