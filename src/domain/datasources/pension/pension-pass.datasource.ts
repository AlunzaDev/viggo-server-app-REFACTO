import { PensionPassEntity } from "../../entities/pension/pension-pass.entity";

export type PensionPassFinancialOperationType = "precontract" | "contract" | "renew";

/** Idempotency log entry stored with the pension pass for each paid operation. */
export interface PensionPassFinancialOperation {
    key: string;
    type: PensionPassFinancialOperationType;
    months: number;
    from: number;
    to: number;
    processedAt: number;
}

export abstract class PensionPassDatasource {
    /** Pension pass that already recorded the operation key (optionally restricted to one pass). */
    abstract findByFinancialOperationKey(
        key: string,
        pensionPassId?: string,
    ): Promise<{ pensionPass: PensionPassEntity; operation: PensionPassFinancialOperation | null } | null>;
    abstract findActiveByIdAndUsuario(id: string, usuarioId: string): Promise<PensionPassEntity | null>;
    /**
     * Assigns a free pass of the pension to the user. Returns null if none is free.
     * Throws UniqueConstraintError if the user already has one or the key was used.
     */
    abstract claimAvailable(input: {
        pensionId: string;
        usuarioId: string;
        from: number;
        to: number;
        operation: PensionPassFinancialOperation;
    }): Promise<PensionPassEntity | null>;
    /** Extends the validity if the pass still ends at expectedTo. Returns null otherwise. */
    abstract applyRenewal(input: {
        id: string;
        usuarioId: string;
        expectedTo: number;
        from: number;
        to: number;
        operation: PensionPassFinancialOperation;
    }): Promise<PensionPassEntity | null>;
    /** Marks a precontracted pass as vigent if it has not changed. Returns null otherwise. */
    abstract applyContract(input: {
        id: string;
        usuarioId: string;
        expectedFrom: number;
        expectedTo: number;
        operation: PensionPassFinancialOperation;
    }): Promise<PensionPassEntity | null>;
    /** Soft-cancels an active pass. Returns null if it does not exist or is already cancelled. */
    abstract cancel(input: {
        id: string;
        cancelledBy: string;
        reason: string;
        cancelledAt: number;
    }): Promise<PensionPassEntity | null>;

    abstract create(pensionPass: Omit<PensionPassEntity, "id">): Promise<PensionPassEntity>;
    abstract findById(id: string): Promise<PensionPassEntity | null>;
    abstract findByIdPass(idPass: string): Promise<PensionPassEntity | null>;
    abstract findAvailableByPension(pensionId: string): Promise<PensionPassEntity | null>;
    abstract findByUsuarioAndPension(
        usuarioId: string,
        pensionId: string,
    ): Promise<PensionPassEntity | null>;
    abstract getAll(): Promise<PensionPassEntity[]>;
    abstract getByPension(pensionId: string): Promise<PensionPassEntity[]>;
    abstract getByUsuario(usuarioId: string): Promise<PensionPassEntity[]>;
    abstract update(
        id: string,
        pensionPass: Partial<Omit<PensionPassEntity, "id">>,
    ): Promise<PensionPassEntity | null>;
    abstract delete(id: string): Promise<PensionPassEntity | null>;
}
