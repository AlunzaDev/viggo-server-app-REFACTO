import {
  ModuloDatasource,
  ModuloFilters,
} from "../../../domain/datasources/parking/modulo.datasource";
import { ModuloEntity } from "../../../domain/entities/parking/modulo.entity";
import { ModuloRepository } from "../../../domain/repository/parking/modulo.repository";

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
  delete(id: string) { return this.datasource.delete(id); }
}
