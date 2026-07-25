import { ModuloSubmoduloDtoValues } from "../../dtos/parking/modulo-submodulo.dto";
import { ModuloEntity, ModuloSubmodulo } from "../../entities/parking/modulo.entity";

export interface ModuloFilters {
  proyecto?: string;
  tipo?: ModuloEntity["tipo"];
  estado?: boolean;
}

export abstract class ModuloDatasource {
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
  abstract getSubmodulos(id: string): Promise<ModuloSubmodulo[] | null>;
  abstract addSubmodulo(
    id: string,
    submodulo: ModuloSubmoduloDtoValues,
  ): Promise<ModuloSubmodulo | null>;
  abstract updateSubmodulo(
    id: string,
    submoduloId: string,
    submodulo: ModuloSubmoduloDtoValues,
  ): Promise<ModuloSubmodulo | null>;
  abstract deleteSubmodulo(id: string, submoduloId: string): Promise<ModuloEntity | null>;
  abstract delete(id: string): Promise<ModuloEntity | null>;
}
