import { ProyectoModel } from "../../../data/mongo/models/parking/proyecto.schema";
import { ProyectoDatasource } from "../../../domain/datasources/parking/proyecto.datasource";
import { ProyectoEntity } from "../../../domain/entities/parking/proyecto.entity";

export class ProyectoMongoDatasource extends ProyectoDatasource {
    async create(proyecto: Omit<ProyectoEntity, "id">): Promise<ProyectoEntity> {
        const proyectoDocument = await ProyectoModel.create(proyecto);
        return ProyectoEntity.fromObject(proyectoDocument.toObject());
    }

    async findById(id: string): Promise<ProyectoEntity | null> {
        const proyectoDocument = await ProyectoModel.findById(id);
        if (!proyectoDocument) return null;

        return ProyectoEntity.fromObject(proyectoDocument.toObject());
    }

    async findByIdentificador(identificador: string): Promise<ProyectoEntity | null> {
        const proyectoDocument = await ProyectoModel.findOne({ identificador });
        if (!proyectoDocument) return null;

        return ProyectoEntity.fromObject(proyectoDocument.toObject());
    }

    async getAll(): Promise<ProyectoEntity[]> {
        const proyectos = await ProyectoModel.find();
        return proyectos.map((proyecto) => ProyectoEntity.fromObject(proyecto.toObject()));
    }

    async update(
        id: string,
        proyecto: Partial<Omit<ProyectoEntity, "id">>,
    ): Promise<ProyectoEntity | null> {
        const proyectoDocument = await ProyectoModel.findByIdAndUpdate(id, proyecto, {
            new: true,
        });

        if (!proyectoDocument) return null;

        return ProyectoEntity.fromObject(proyectoDocument.toObject());
    }

    async delete(id: string): Promise<ProyectoEntity | null> {
        const proyectoDocument = await ProyectoModel.findByIdAndDelete(id);

        if (!proyectoDocument) return null;

        return ProyectoEntity.fromObject(proyectoDocument.toObject());
    }
}
