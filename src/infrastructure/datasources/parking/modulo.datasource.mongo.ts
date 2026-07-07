import { ModuloModel } from "../../../data/mongo/models/parking/modulo.schema";
import { ModuloDatasource } from "../../../domain/datasources/parking/modulo.datasource";
import { ModuloEntity } from "../../../domain/entities/parking/modulo.entity";

export class ModuloMongoDatasource extends ModuloDatasource {
    async create(modulo: Omit<ModuloEntity, "id">): Promise<ModuloEntity> {
        const moduloDocument = await ModuloModel.create(modulo);
        return ModuloEntity.fromObject(moduloDocument.toObject());
    }

    async findById(id: string): Promise<ModuloEntity | null> {
        const moduloDocument = await ModuloModel.findById(id);
        if (!moduloDocument) return null;

        return ModuloEntity.fromObject(moduloDocument.toObject());
    }

    async findByIdentificador(identificador: string): Promise<ModuloEntity | null> {
        const moduloDocument = await ModuloModel.findOne({ identificador });
        if (!moduloDocument) return null;

        return ModuloEntity.fromObject(moduloDocument.toObject());
    }

    async getAll(): Promise<ModuloEntity[]> {
        const modulos = await ModuloModel.find();
        return modulos.map((modulo) => ModuloEntity.fromObject(modulo.toObject()));
    }

    async getByProyecto(proyectoId: string): Promise<ModuloEntity[]> {
        const modulos = await ModuloModel.find({ proyecto: proyectoId });
        return modulos.map((modulo) => ModuloEntity.fromObject(modulo.toObject()));
    }

    async update(
        id: string,
        modulo: Partial<Omit<ModuloEntity, "id">>,
    ): Promise<ModuloEntity | null> {
        const moduloDocument = await ModuloModel.findByIdAndUpdate(id, modulo, {
            new: true,
        });

        if (!moduloDocument) return null;

        return ModuloEntity.fromObject(moduloDocument.toObject());
    }

    async delete(id: string): Promise<ModuloEntity | null> {
        const moduloDocument = await ModuloModel.findByIdAndUpdate(
            id,
            { estado: false },
            { new: true },
        );

        if (!moduloDocument) return null;

        return ModuloEntity.fromObject(moduloDocument.toObject());
    }
}