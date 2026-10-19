import { InstallationsRepository } from "../../../domain/repositories/installations/installations.repository";

export class InstallationsService {
  constructor(private readonly repository: InstallationsRepository) {}

  getRequests() {
    return this.repository.getRequests();
  }

  async approveRequest(payload: {
    requestId: string;
    userId: string;
    userName: string;
    note?: string;
  }) {
    // The installation syncs its configuration itself once it receives its token.
    return this.repository.approveRequest(payload);
  }

  rejectRequest(payload: {
    requestId: string;
    userId: string;
    userName: string;
    note: string;
  }) {
    return this.repository.rejectRequest(payload);
  }

  requestTokenRotation(requestId: string) {
    return this.repository.requestSyncTokenRotation(requestId);
  }

  unlinkTemporary(payload: {
    requestId: string;
    userId: string;
    userName: string;
    note?: string;
  }) {
    return this.repository.unlinkTemporary(payload);
  }

  unlinkPermanent(payload: {
    requestId: string;
    userId: string;
    userName: string;
    note?: string;
  }) {
    return this.repository.unlinkPermanent(payload);
  }

}
