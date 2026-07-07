import { PensionDatasource } from "../../../domain/datasources/pension/pension.datasource";
import { PensionEntity } from "../../../domain/entities/pension/pension.entity";
import { PensionRepository } from "../../../domain/repository/pension/pension.repository";

export class PensionRepositoryImpl implements PensionRepository {
    constructor(private readonly pensionDatasource: PensionDatasource) {}

    create(pension: Omit<PensionEntity, "id">): Promise<PensionEntity> {
        return this.pensionDatasource.create(pension);
    }

    findById(id: string): Promise<PensionEntity | null> {
        return this.pensionDatasource.findById(id);
    }

    getAll(): Promise<PensionEntity[]> {
        return this.pensionDatasource.getAll();
    }

    getByProyecto(proyectoId: string): Promise<PensionEntity[]> {
        return this.pensionDatasource.getByProyecto(proyectoId);
    }

    update(
        id: string,
        pension: Partial<Omit<PensionEntity, "id">>,
    ): Promise<PensionEntity | null> {
        return this.pensionDatasource.update(id, pension);
    }

    delete(id: string): Promise<PensionEntity | null> {
        return this.pensionDatasource.delete(id);
    }
}