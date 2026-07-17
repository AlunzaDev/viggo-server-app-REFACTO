import {
    ModuloDatasource,
    ModuloFilters,
} from "../../../domain/datasources/parking/modulo.datasource";
import { ModuloEntity } from "../../../domain/entities/parking/modulo.entity";
import { ModuloRepository } from "../../../domain/repository/parking/modulo.repository";

export class ModuloRepositoryImpl implements ModuloRepository {
    constructor(private readonly moduloDatasource: ModuloDatasource) {}

    create(modulo: Omit<ModuloEntity, "id">): Promise<ModuloEntity> {
        return this.moduloDatasource.create(modulo);
    }

    findById(id: string): Promise<ModuloEntity | null> {
        return this.moduloDatasource.findById(id);
    }

    findByIdentificador(identificador: string): Promise<ModuloEntity | null> {
        return this.moduloDatasource.findByIdentificador(identificador);
    }

    getAll(): Promise<ModuloEntity[]> {
        return this.moduloDatasource.getAll();
    }

    getWithPendingDeviceBindingRequests(): Promise<ModuloEntity[]> {
        return this.moduloDatasource.getWithPendingDeviceBindingRequests();
    }

    getFiltered(filters: ModuloFilters): Promise<ModuloEntity[]> {
        return this.moduloDatasource.getFiltered(filters);
    }

    getByProyecto(proyectoId: string): Promise<ModuloEntity[]> {
        return this.moduloDatasource.getByProyecto(proyectoId);
    }

    update(
        id: string,
        modulo: Partial<Omit<ModuloEntity, "id">>,
    ): Promise<ModuloEntity | null> {
        return this.moduloDatasource.update(id, modulo);
    }

    resetDeviceBinding(id: string): Promise<ModuloEntity | null> {
        return this.moduloDatasource.resetDeviceBinding(id);
    }

    delete(id: string): Promise<ModuloEntity | null> {
        return this.moduloDatasource.delete(id);
    }
}
