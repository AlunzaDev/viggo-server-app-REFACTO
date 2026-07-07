import { ProyectoDatasource } from "../../../domain/datasources/parking/proyecto.datasource";
import { ProyectoEntity } from "../../../domain/entities/parking/proyecto.entity";
import { ProyectoRepository } from "../../../domain/repository/parking/proyecto.repository";

export class ProyectoRepositoryImpl implements ProyectoRepository {
    constructor(private readonly proyectoDatasource: ProyectoDatasource) {}

    create(proyecto: Omit<ProyectoEntity, "id">): Promise<ProyectoEntity> {
        return this.proyectoDatasource.create(proyecto);
    }

    findById(id: string): Promise<ProyectoEntity | null> {
        return this.proyectoDatasource.findById(id);
    }

    findByIdentificador(identificador: string): Promise<ProyectoEntity | null> {
        return this.proyectoDatasource.findByIdentificador(identificador);
    }

    getAll(): Promise<ProyectoEntity[]> {
        return this.proyectoDatasource.getAll();
    }

    update(
        id: string,
        proyecto: Partial<Omit<ProyectoEntity, "id">>,
    ): Promise<ProyectoEntity | null> {
        return this.proyectoDatasource.update(id, proyecto);
    }

    delete(id: string): Promise<ProyectoEntity | null> {
        return this.proyectoDatasource.delete(id);
    }
}