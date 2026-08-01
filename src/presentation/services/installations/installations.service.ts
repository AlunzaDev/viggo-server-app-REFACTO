import { envs } from "../../../config";
import { InstallationsRepository } from "../../../domain/repository/installations/installations.repository";

const buildLocalUrl = (baseUrl: string, path: string) =>
  `${baseUrl.replace(/\/+$/, "")}${path}`;

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
    const request = await this.repository.approveRequest(payload);
    if (!request || "missingProject" in request) return request;

    const localApiBaseUrl = String(request.localApiBaseUrl ?? "").trim();
    await this.triggerLocalSync(localApiBaseUrl);
    return request;
  }

  rejectRequest(payload: {
    requestId: string;
    userId: string;
    userName: string;
    note: string;
  }) {
    return this.repository.rejectRequest(payload);
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

  private async triggerLocalSync(localApiBaseUrl: string) {
    if (!localApiBaseUrl) return;

    try {
      await fetch(
        buildLocalUrl(localApiBaseUrl, "/api/config/sync-now/service"),
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${envs.SYNC_SERVICE_TOKEN}`,
            "X-Viggo-Sync-Source": "administrativo-approval",
          },
        },
      );
    } catch {}
  }
}
