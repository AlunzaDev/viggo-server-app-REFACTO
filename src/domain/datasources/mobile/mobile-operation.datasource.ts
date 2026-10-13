export const MOBILE_OPERATION_STATUSES = [
  "pending",
  "processing",
  "completed",
  "failed",
  "expired",
  "dead_letter",
] as const;

export type MobileOperationStatus = (typeof MOBILE_OPERATION_STATUSES)[number];

export interface MobileOperationRecord {
  operationId: string;
  idempotencyKey: string;
  type: string;
  installationId: string;
  proyectoId: string;
  userId: string;
  payload: Record<string, unknown>;
  result?: Record<string, any>;
  status: MobileOperationStatus;
  error?: string;
  attempts: number;
  maxAttempts: number;
  nextRetryAt?: number;
  claimedAt?: number;
  lastAttemptAt?: number;
  processingDeadlineAt?: number;
  completedAt?: number;
  expiresAt?: number;
  createdAt: number;
  updatedAt: number;
}

export type NewMobileOperation = Pick<
  MobileOperationRecord,
  | "operationId"
  | "idempotencyKey"
  | "type"
  | "installationId"
  | "proyectoId"
  | "userId"
  | "payload"
  | "status"
  | "attempts"
  | "maxAttempts"
  | "nextRetryAt"
  | "expiresAt"
  | "createdAt"
  | "updatedAt"
>;

export interface MobileOperationFilters {
  status?: string;
  type?: string;
  proyectoId?: string;
  installationId?: string;
}

export interface MobileOperationCompletion {
  status: "completed" | "failed" | "dead_letter";
  result?: Record<string, unknown>;
  error: string;
  nextRetryAt?: number;
  completedAt?: number;
  updatedAt: number;
}

export interface PageOptions {
  page: number;
  limit: number;
}

export abstract class MobileOperationDatasource {
  abstract findByIdempotencyKey(idempotencyKey: string): Promise<MobileOperationRecord | null>;
  abstract findByOperationId(operationId: string, userId?: string): Promise<MobileOperationRecord | null>;
  /** Throws UniqueConstraintError when the idempotencyKey or operationId already exists. */
  abstract create(operation: NewMobileOperation): Promise<MobileOperationRecord>;
  /** Inserts the operation only if its idempotencyKey is new; returns the stored one. */
  abstract createIfAbsent(operation: NewMobileOperation): Promise<MobileOperationRecord>;

  abstract findLatestCompletedWithTicket(userId: string, types?: string[]): Promise<MobileOperationRecord | null>;
  abstract findCompletedWithTicket(userId: string, range: { from?: number; to?: number }): Promise<MobileOperationRecord[]>;
  /** Latest completed CREATE_TICKET for the ticket, by completion time. */
  abstract findCompletedTicketSource(userId: string, ticketId: string): Promise<MobileOperationRecord | null>;
  /** Latest CREATE_TICKET for the ticket in any status, by creation time. */
  abstract findLatestTicketSource(userId: string, ticketId: string): Promise<MobileOperationRecord | null>;

  abstract list(filters: MobileOperationFilters, page: PageOptions): Promise<{ total: number; operations: MobileOperationRecord[] }>;
  abstract countByStatus(statuses: MobileOperationStatus[]): Promise<number>;
  abstract reactivate(operationId: string, now: number): Promise<MobileOperationRecord | null>;

  // Queue maintenance and claiming for a local installation.
  abstract expireOverdue(installationId: string, now: number): Promise<void>;
  abstract findRecentDeadLetters(installationId: string, since: number): Promise<MobileOperationRecord[]>;
  abstract releaseStaleProcessing(installationId: string, staleBefore: number, now: number): Promise<void>;
  abstract moveExhaustedToDeadLetter(installationId: string, now: number): Promise<void>;
  abstract claimNext(installationId: string, now: number, processingTimeoutMs: number): Promise<MobileOperationRecord | null>;
  abstract findForCompletion(operationId: string, installationId: string): Promise<MobileOperationRecord | null>;
  abstract complete(operationId: string, installationId: string, completion: MobileOperationCompletion): Promise<MobileOperationRecord | null>;

  // Startup recovery.
  abstract backfillRetryPolicy(): Promise<void>;
  abstract recoverStaleProcessing(now: number, staleBefore: number): Promise<void>;
}
