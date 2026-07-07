import { PensionMoveDatasource } from "../../../domain/datasources/pension/pension-move.datasource";
import { PensionMoveEntity } from "../../../domain/entities/pension/pension-move.entity";
import { PensionMoveRepository } from "../../../domain/repository/pension/pension-move.repository";

export class PensionMoveRepositoryImpl implements PensionMoveRepository {
    constructor(private readonly pensionMoveDatasource: PensionMoveDatasource) {}

    create(pensionMove: Omit<PensionMoveEntity, "id">): Promise<PensionMoveEntity> {
        return this.pensionMoveDatasource.create(pensionMove);
    }

    findById(id: string): Promise<PensionMoveEntity | null> {
        return this.pensionMoveDatasource.findById(id);
    }

    getAll(): Promise<PensionMoveEntity[]> {
        return this.pensionMoveDatasource.getAll();
    }

    getByPensionPass(pensionPassId: string): Promise<PensionMoveEntity[]> {
        return this.pensionMoveDatasource.getByPensionPass(pensionPassId);
    }

    getByProyecto(proyectoId: string): Promise<PensionMoveEntity[]> {
        return this.pensionMoveDatasource.getByProyecto(proyectoId);
    }

    update(
        id: string,
        pensionMove: Partial<Omit<PensionMoveEntity, "id">>,
    ): Promise<PensionMoveEntity | null> {
        return this.pensionMoveDatasource.update(id, pensionMove);
    }

    delete(id: string): Promise<PensionMoveEntity | null> {
        return this.pensionMoveDatasource.delete(id);
    }
}