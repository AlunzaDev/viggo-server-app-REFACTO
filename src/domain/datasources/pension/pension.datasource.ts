import { PensionEntity } from "../../entities/pension/pension.entity";

export abstract class PensionDatasource {
    abstract create(pension: Omit<PensionEntity, "id">): Promise<PensionEntity>;
    abstract findById(id: string): Promise<PensionEntity | null>;
    abstract getAll(): Promise<PensionEntity[]>;
    abstract getByProyecto(proyectoId: string): Promise<PensionEntity[]>;
    abstract update(
        id: string,
        pension: Partial<Omit<PensionEntity, "id">>,
    ): Promise<PensionEntity | null>;
    abstract delete(id: string): Promise<PensionEntity | null>;
    /** Soft-cancels an active pension. Returns null if it does not exist or is already cancelled. */
    abstract cancel(input: {
        id: string;
        cancelledBy: string;
        reason: string;
        cancelledAt: number;
    }): Promise<PensionEntity | null>;
}