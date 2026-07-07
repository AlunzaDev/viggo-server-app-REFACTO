import { PensionPassEntity } from "../../entities/pension/pension-pass.entity";

export abstract class PensionPassDatasource {
    abstract create(pensionPass: Omit<PensionPassEntity, "id">): Promise<PensionPassEntity>;
    abstract findById(id: string): Promise<PensionPassEntity | null>;
    abstract findByIdPass(idPass: string): Promise<PensionPassEntity | null>;
    abstract getAll(): Promise<PensionPassEntity[]>;
    abstract getByPension(pensionId: string): Promise<PensionPassEntity[]>;
    abstract getByUsuario(usuarioId: string): Promise<PensionPassEntity[]>;
    abstract update(
        id: string,
        pensionPass: Partial<Omit<PensionPassEntity, "id">>,
    ): Promise<PensionPassEntity | null>;
    abstract delete(id: string): Promise<PensionPassEntity | null>;
}