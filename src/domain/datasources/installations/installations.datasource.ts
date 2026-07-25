export type InstallationReviewPayload = {
  requestId: string;
  userId: string;
  userName: string;
  note?: string;
};

export abstract class InstallationsDatasource {
  abstract getRequests(): Promise<any[]>;
  abstract approveRequest(payload: InstallationReviewPayload): Promise<any>;
  abstract rejectRequest(
    payload: InstallationReviewPayload & { note: string },
  ): Promise<any>;
}
