import { InstallationsRepository } from "../../../domain/repository/installations/installations.repository";

export class InstallationsService {
  constructor(private readonly repository: InstallationsRepository) {}

  getRequests() {
    return this.repository.getRequests();
  }

  approveRequest(payload: {
    requestId: string;
    userId: string;
    userName: string;
    note?: string;
  }) {
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
}
