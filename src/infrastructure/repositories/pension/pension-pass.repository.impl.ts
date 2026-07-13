import { PensionPassDatasource } from "../../../domain/datasources/pension/pension-pass.datasource";
import { PensionPassEntity } from "../../../domain/entities/pension/pension-pass.entity";
import { PensionPassRepository } from "../../../domain/repository/pension/pension-pass.repository";

export class PensionPassRepositoryImpl implements PensionPassRepository {
    constructor(private readonly pensionPassDatasource: PensionPassDatasource) {}

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
}
