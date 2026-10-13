import type {
  MobileOperationCompletion,
  MobileOperationFilters,
  MobileOperationRecord,
  MobileOperationStatus,
  NewMobileOperation,
  PageOptions,
} from "../../datasources/mobile/mobile-operation.datasource";

export abstract class MobileOperationRepository {
  abstract findByIdempotencyKey(idempotencyKey: string): Promise<MobileOperationRecord | null>;
  abstract findByOperationId(operationId: string, userId?: string): Promise<MobileOperationRecord | null>;
  abstract create(operation: NewMobileOperation): Promise<MobileOperationRecord>;
  abstract createIfAbsent(operation: NewMobileOperation): Promise<MobileOperationRecord>;

  abstract findLatestCompletedWithTicket(userId: string, types?: string[]): Promise<MobileOperationRecord | null>;
  abstract findCompletedWithTicket(userId: string, range: { from?: number; to?: number }): Promise<MobileOperationRecord[]>;
  abstract findCompletedTicketSource(userId: string, ticketId: string): Promise<MobileOperationRecord | null>;
  abstract findLatestTicketSource(userId: string, ticketId: string): Promise<MobileOperationRecord | null>;

  abstract list(filters: MobileOperationFilters, page: PageOptions): Promise<{ total: number; operations: MobileOperationRecord[] }>;
  abstract countByStatus(statuses: MobileOperationStatus[]): Promise<number>;
  abstract reactivate(operationId: string, now: number): Promise<MobileOperationRecord | null>;

  abstract expireOverdue(installationId: string, now: number): Promise<void>;
  abstract findRecentDeadLetters(installationId: string, since: number): Promise<MobileOperationRecord[]>;
  abstract releaseStaleProcessing(installationId: string, staleBefore: number, now: number): Promise<void>;
  abstract moveExhaustedToDeadLetter(installationId: string, now: number): Promise<void>;
  abstract claimNext(installationId: string, now: number, processingTimeoutMs: number): Promise<MobileOperationRecord | null>;
  abstract findForCompletion(operationId: string, installationId: string): Promise<MobileOperationRecord | null>;
  abstract complete(operationId: string, installationId: string, completion: MobileOperationCompletion): Promise<MobileOperationRecord | null>;

  abstract backfillRetryPolicy(): Promise<void>;
  abstract recoverStaleProcessing(now: number, staleBefore: number): Promise<void>;
}
