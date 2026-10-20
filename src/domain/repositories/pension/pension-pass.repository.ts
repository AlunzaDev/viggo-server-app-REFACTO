import type { PensionPassDatasource, PensionPassFinancialOperation } from "../../datasources/pension/pension-pass.datasource";
import { PensionPassEntity } from "../../entities/pension/pension-pass.entity";

export abstract class PensionPassRepository {
    abstract findByFinancialOperationKey(
        key: string,
        pensionPassId?: string,
    ): Promise<{ pensionPass: PensionPassEntity; operation: PensionPassFinancialOperation | null } | null>;
    abstract findActiveByIdAndUsuario(id: string, usuarioId: string): Promise<PensionPassEntity | null>;
    abstract claimAvailable(input: {
        pensionId: string;
        usuarioId: string;
        from: number;
        to: number;
        operation: PensionPassFinancialOperation;
    }): Promise<PensionPassEntity | null>;
    abstract applyRenewal(input: {
        id: string;
        usuarioId: string;
        expectedTo: number;
        from: number;
        to: number;
        operation: PensionPassFinancialOperation;
    }): Promise<PensionPassEntity | null>;
    abstract applyContract(input: {
        id: string;
        usuarioId: string;
        expectedFrom: number;
        expectedTo: number;
        operation: PensionPassFinancialOperation;
    }): Promise<PensionPassEntity | null>;
    abstract cancel(input: {
        id: string;
        cancelledBy: string;
        reason: string;
        cancelledAt: number;
    }): Promise<PensionPassEntity | null>;

    abstract create(pensionPass: Omit<PensionPassEntity, "id">): Promise<PensionPassEntity>;
    abstract findById(id: string): Promise<PensionPassEntity | null>;
    abstract listMovements(input: Parameters<PensionPassDatasource["listMovements"]>[0]): ReturnType<PensionPassDatasource["listMovements"]>;
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
