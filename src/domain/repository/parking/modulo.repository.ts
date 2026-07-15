import { ModuloFilters } from "../../datasources/parking/modulo.datasource";
import { ModuloEntity } from "../../entities/parking/modulo.entity";

export abstract class ModuloRepository {
    abstract create(modulo: Omit<ModuloEntity, "id">): Promise<ModuloEntity>;
    abstract findById(id: string): Promise<ModuloEntity | null>;
    abstract findByIdentificador(identificador: string): Promise<ModuloEntity | null>;
    abstract getAll(): Promise<ModuloEntity[]>;
    abstract getFiltered(filters: ModuloFilters): Promise<ModuloEntity[]>;
    abstract getByProyecto(proyectoId: string): Promise<ModuloEntity[]>;
    abstract update(
        id: string,
        modulo: Partial<Omit<ModuloEntity, "id">>,
    ): Promise<ModuloEntity | null>;
    abstract delete(id: string): Promise<ModuloEntity | null>;
}
