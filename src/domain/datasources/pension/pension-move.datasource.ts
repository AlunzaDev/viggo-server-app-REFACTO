import { PensionMoveEntity } from "../../entities/pension/pension-move.entity";

export abstract class PensionMoveDatasource {
    abstract create(pensionMove: Omit<PensionMoveEntity, "id">): Promise<PensionMoveEntity>;
    abstract findById(id: string): Promise<PensionMoveEntity | null>;
    abstract getAll(): Promise<PensionMoveEntity[]>;
    abstract getByPensionPass(pensionPassId: string): Promise<PensionMoveEntity[]>;
    abstract getByProyecto(proyectoId: string): Promise<PensionMoveEntity[]>;
    abstract update(
        id: string,
        pensionMove: Partial<Omit<PensionMoveEntity, "id">>,
    ): Promise<PensionMoveEntity | null>;
    abstract delete(id: string): Promise<PensionMoveEntity | null>;
}