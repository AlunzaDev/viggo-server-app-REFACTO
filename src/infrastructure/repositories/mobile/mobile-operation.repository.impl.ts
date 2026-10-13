import type {
  MobileOperationCompletion,
  MobileOperationDatasource,
  MobileOperationFilters,
  MobileOperationStatus,
  NewMobileOperation,
  PageOptions,
} from "../../../domain/datasources/mobile/mobile-operation.datasource";
import { MobileOperationRepository } from "../../../domain/repositories/mobile/mobile-operation.repository";

export class MobileOperationRepositoryImpl implements MobileOperationRepository {
  constructor(private readonly datasource: MobileOperationDatasource) {}

  findByIdempotencyKey(idempotencyKey: string) {
    return this.datasource.findByIdempotencyKey(idempotencyKey);
  }

  findByOperationId(operationId: string, userId?: string) {
    return this.datasource.findByOperationId(operationId, userId);
  }

  create(operation: NewMobileOperation) {
    return this.datasource.create(operation);
  }

  createIfAbsent(operation: NewMobileOperation) {
    return this.datasource.createIfAbsent(operation);
  }

  findLatestCompletedWithTicket(userId: string, types?: string[]) {
    return this.datasource.findLatestCompletedWithTicket(userId, types);
  }

  findCompletedWithTicket(userId: string, range: { from?: number; to?: number }) {
    return this.datasource.findCompletedWithTicket(userId, range);
  }

  findCompletedTicketSource(userId: string, ticketId: string) {
    return this.datasource.findCompletedTicketSource(userId, ticketId);
  }

  findLatestTicketSource(userId: string, ticketId: string) {
    return this.datasource.findLatestTicketSource(userId, ticketId);
  }

  list(filters: MobileOperationFilters, page: PageOptions) {
    return this.datasource.list(filters, page);
  }

  countByStatus(statuses: MobileOperationStatus[]) {
    return this.datasource.countByStatus(statuses);
  }

  reactivate(operationId: string, now: number) {
    return this.datasource.reactivate(operationId, now);
  }

  expireOverdue(installationId: string, now: number) {
    return this.datasource.expireOverdue(installationId, now);
  }

  findRecentDeadLetters(installationId: string, since: number) {
    return this.datasource.findRecentDeadLetters(installationId, since);
  }

  releaseStaleProcessing(installationId: string, staleBefore: number, now: number) {
    return this.datasource.releaseStaleProcessing(installationId, staleBefore, now);
  }

  moveExhaustedToDeadLetter(installationId: string, now: number) {
    return this.datasource.moveExhaustedToDeadLetter(installationId, now);
  }

  claimNext(installationId: string, now: number, processingTimeoutMs: number) {
    return this.datasource.claimNext(installationId, now, processingTimeoutMs);
  }

  findForCompletion(operationId: string, installationId: string) {
    return this.datasource.findForCompletion(operationId, installationId);
  }

  complete(operationId: string, installationId: string, completion: MobileOperationCompletion) {
    return this.datasource.complete(operationId, installationId, completion);
  }

  backfillRetryPolicy() {
    return this.datasource.backfillRetryPolicy();
  }

  recoverStaleProcessing(now: number, staleBefore: number) {
    return this.datasource.recoverStaleProcessing(now, staleBefore);
  }
}
