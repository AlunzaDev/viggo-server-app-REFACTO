import {
    PensionPassDatasource,
    PensionPassFinancialOperation,
} from "../../../domain/datasources/pension/pension-pass.datasource";
import { PensionPassEntity } from "../../../domain/entities/pension/pension-pass.entity";
import { PensionPassRepository } from "../../../domain/repositories/pension/pension-pass.repository";

export class PensionPassRepositoryImpl implements PensionPassRepository {
    constructor(private readonly pensionPassDatasource: PensionPassDatasource) {}

    findByFinancialOperationKey(key: string, pensionPassId?: string) {
        return this.pensionPassDatasource.findByFinancialOperationKey(key, pensionPassId);
    }

    findActiveByIdAndUsuario(id: string, usuarioId: string): Promise<PensionPassEntity | null> {
        return this.pensionPassDatasource.findActiveByIdAndUsuario(id, usuarioId);
    }

    claimAvailable(input: {
        pensionId: string;
        usuarioId: string;
        from: number;
        to: number;
        operation: PensionPassFinancialOperation;
    }): Promise<PensionPassEntity | null> {
        return this.pensionPassDatasource.claimAvailable(input);
    }

    applyRenewal(input: {
        id: string;
        usuarioId: string;
        expectedTo: number;
        from: number;
        to: number;
        operation: PensionPassFinancialOperation;
    }): Promise<PensionPassEntity | null> {
        return this.pensionPassDatasource.applyRenewal(input);
    }

    applyContract(input: {
        id: string;
        usuarioId: string;
        expectedFrom: number;
        expectedTo: number;
        operation: PensionPassFinancialOperation;
    }): Promise<PensionPassEntity | null> {
        return this.pensionPassDatasource.applyContract(input);
    }

    cancel(input: {
        id: string;
        cancelledBy: string;
        reason: string;
        cancelledAt: number;
    }): Promise<PensionPassEntity | null> {
        return this.pensionPassDatasource.cancel(input);
    }

    create(pensionPass: Omit<PensionPassEntity, "id">): Promise<PensionPassEntity> {
        return this.pensionPassDatasource.create(pensionPass);
    }

    findById(id: string): Promise<PensionPassEntity | null> {
        return this.pensionPassDatasource.findById(id);
    }

    findByIdPass(idPass: string): Promise<PensionPassEntity | null> {
        return this.pensionPassDatasource.findByIdPass(idPass);
    }

    findAvailableByPension(pensionId: string): Promise<PensionPassEntity | null> {
        return this.pensionPassDatasource.findAvailableByPension(pensionId);
    }

    findByUsuarioAndPension(
        usuarioId: string,
        pensionId: string,
    ): Promise<PensionPassEntity | null> {
        return this.pensionPassDatasource.findByUsuarioAndPension(usuarioId, pensionId);
    }

    getAll(): Promise<PensionPassEntity[]> {
        return this.pensionPassDatasource.getAll();
    }

    getByPension(pensionId: string): Promise<PensionPassEntity[]> {
        return this.pensionPassDatasource.getByPension(pensionId);
    }

    getByUsuario(usuarioId: string): Promise<PensionPassEntity[]> {
        return this.pensionPassDatasource.getByUsuario(usuarioId);
    }

    update(
        id: string,
        pensionPass: Partial<Omit<PensionPassEntity, "id">>,
    ): Promise<PensionPassEntity | null> {
        return this.pensionPassDatasource.update(id, pensionPass);
    }

    delete(id: string): Promise<PensionPassEntity | null> {
        return this.pensionPassDatasource.delete(id);
    }

    listMovements(input: Parameters<PensionPassDatasource["listMovements"]>[0]) {
        return this.pensionPassDatasource.listMovements(input);
    }
}
