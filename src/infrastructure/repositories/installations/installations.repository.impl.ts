import type {
  InstallationReviewPayload,
  InstallationsDatasource,
} from "../../../domain/datasources/installations/installations.datasource";
import { InstallationsRepository } from "../../../domain/repository/installations/installations.repository";

export class InstallationsRepositoryImpl implements InstallationsRepository {
  constructor(private readonly datasource: InstallationsDatasource) {}

  getRequests() {
    return this.datasource.getRequests();
  }

  approveRequest(payload: InstallationReviewPayload) {
    return this.datasource.approveRequest(payload);
  }

  rejectRequest(payload: InstallationReviewPayload & { note: string }) {
    return this.datasource.rejectRequest(payload);
  }
}
