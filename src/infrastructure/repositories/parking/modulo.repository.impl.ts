import {
  ModuloDatasource,
  ModuloFilters,
} from "../../../domain/datasources/parking/modulo.datasource";
import { ModuloSubmoduloDtoValues } from "../../../domain/dtos/parking/modulo-submodulo.dto";
import { ModuloEntity } from "../../../domain/entities/parking/modulo.entity";
import { ModuloRepository } from "../../../domain/repositories/parking/modulo.repository";

export class ModuloRepositoryImpl implements ModuloRepository {
  constructor(private readonly datasource: ModuloDatasource) {}

  create(modulo: Omit<ModuloEntity, "id">) { return this.datasource.create(modulo); }
  findById(id: string) { return this.datasource.findById(id); }
  findByIdentificador(identificador: string) { return this.datasource.findByIdentificador(identificador); }
  getAll() { return this.datasource.getAll(); }
  getFiltered(filters: ModuloFilters) { return this.datasource.getFiltered(filters); }
  getByProyecto(proyectoId: string) { return this.datasource.getByProyecto(proyectoId); }
  update(id: string, modulo: Partial<Omit<ModuloEntity, "id">>) {
    return this.datasource.update(id, modulo);
  }
  getSubmodulos(id: string) { return this.datasource.getSubmodulos(id); }
  addSubmodulo(id: string, submodulo: ModuloSubmoduloDtoValues) {
    return this.datasource.addSubmodulo(id, submodulo);
  }
  updateSubmodulo(
    id: string,
    submoduloId: string,
    submodulo: ModuloSubmoduloDtoValues,
  ) {
    return this.datasource.updateSubmodulo(id, submoduloId, submodulo);
  }
  deleteSubmodulo(id: string, submoduloId: string) {
    return this.datasource.deleteSubmodulo(id, submoduloId);
  }
  delete(id: string) { return this.datasource.delete(id); }
}
