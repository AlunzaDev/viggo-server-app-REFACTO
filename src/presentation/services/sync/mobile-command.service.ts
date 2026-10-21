import type { MobileOperationRecord } from "../../../domain/datasources/mobile/mobile-operation.datasource";
import { CustomError } from "../../../domain/errors/custom.error";
import type { InstallationsRepository } from "../../../domain/repositories/installations/installations.repository";
import type { MobileOperationRepository } from "../../../domain/repositories/mobile/mobile-operation.repository";
import { OperationalIncidentService } from "../incidents/operational-incident.service";

/** A command handed out and not answered in this long goes back to the queue. */
const PROCESSING_TIMEOUT_MS = 60_000;
/** Wait before each retry of a failed command, by attempts made. */
const BACKOFF_MS = [0, 30_000, 120_000, 300_000, 900_000];

const nextRetryAt = (attempts: number, now: number) => now + BACKOFF_MS[Math.min(Math.max(attempts, 0), BACKOFF_MS.length - 1)];

export interface MobileCommandAnswer {
  success: boolean;
  result?: Record<string, unknown>;
  error?: string;
}

/**
 * The queue of the app's commands seen from an installation: OPERATIVO polls for the next one
 * and answers it. Polling also marks the parking online and housekeeps the queue.
 */
export class MobileCommandService {
  constructor(
    private readonly operations: MobileOperationRepository,
    private readonly installations: InstallationsRepository,
  ) {}

  /** The next due command for the installation, or null. */
  async claimNext(installationId: string, now = Date.now()): Promise<MobileOperationRecord | null> {
    await this.installations.recordCommandPoll(installationId, now);
    await OperationalIncidentService.resolve(`installation-offline:${installationId}`);
    await this.operations.expireOverdue(installationId, now);
    const deadLetters = await this.operations.findRecentDeadLetters(installationId, now - 5_000);
    await Promise.all(deadLetters.map((operation) =>
      OperationalIncidentService.open({
        incidentKey: `mobile-operation-dead-letter:${operation.operationId}`,
        type: "MOBILE_OPERATION_DEAD_LETTER",
        // A payment that never reached the parking needs someone now.
        severity: operation.type === "APPLY_TICKET_PAYMENT" ? "critical" : "warning",
        source: "admin-sync",
        projectId: String(operation.proyectoId ?? ""),
        installationId: String(operation.installationId ?? ""),
        operationId: String(operation.operationId ?? ""),
        message: `Operacion movil en dead_letter: ${operation.type}`,
        metadata: { type: operation.type, attempts: operation.attempts, maxAttempts: operation.maxAttempts, error: operation.error },
      }),
    ));
    await this.operations.releaseStaleProcessing(installationId, now - PROCESSING_TIMEOUT_MS, now);
    await this.operations.moveExhaustedToDeadLetter(installationId, now);
    return this.operations.claimNext(installationId, now, PROCESSING_TIMEOUT_MS);
  }

  /**
   * OPERATIVO's answer. A failure is retried later while attempts remain, then goes to dead
   * letter. An already completed command keeps its first answer.
   */
  async complete(installationId: string, operationId: string, answer: MobileCommandAnswer, now = Date.now()): Promise<MobileOperationRecord> {
    const current = await this.operations.findForCompletion(operationId, installationId);
    if (!current) throw CustomError.notFound("Operacion no encontrada");
    if (current.status === "completed") return current;
    const attempts = Number(current.attempts ?? 0);
    const retryable = !answer.success && attempts < Number(current.maxAttempts ?? 5);
    const operation = await this.operations.complete(operationId, installationId, {
      status: answer.success ? "completed" : retryable ? "failed" : "dead_letter",
      result: answer.success ? answer.result : undefined,
      error: answer.success ? "" : answer.error ?? "No se pudo ejecutar la operacion",
      nextRetryAt: retryable ? nextRetryAt(attempts, now) : undefined,
      completedAt: answer.success || !retryable ? now : undefined,
      updatedAt: now,
    });
    if (!operation) throw CustomError.notFound("Operacion no encontrada");
    return operation;
  }
}
