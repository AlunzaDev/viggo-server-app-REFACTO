import { PensionModel } from "../../../data/mongo/models/pension/pension.schema";
import { PensionDatasource } from "../../../domain/datasources/pension/pension.datasource";
import { PensionEntity } from "../../../domain/entities/pension/pension.entity";

export class PensionMongoDatasource extends PensionDatasource {
    async create(pension: Omit<PensionEntity, "id">): Promise<PensionEntity> {
        const pensionDocument = await PensionModel.create(pension);
        return PensionEntity.fromObject(pensionDocument.toObject());
    }

    async findById(id: string): Promise<PensionEntity | null> {
        const pensionDocument = await PensionModel.findById(id);
        if (!pensionDocument) return null;

        return PensionEntity.fromObject(pensionDocument.toObject());
    }

    async getAll(): Promise<PensionEntity[]> {
        const pensiones = await PensionModel.find();
        return pensiones.map((pension) => PensionEntity.fromObject(pension.toObject()));
    }

    async getByProyecto(proyectoId: string): Promise<PensionEntity[]> {
        const pensiones = await PensionModel.find({ proyecto: proyectoId });
        return pensiones.map((pension) => PensionEntity.fromObject(pension.toObject()));
    }

    async update(
        id: string,
        pension: Partial<Omit<PensionEntity, "id">>,
    ): Promise<PensionEntity | null> {
        const pensionDocument = await PensionModel.findByIdAndUpdate(id, pension, {
            new: true,
        });

        if (!pensionDocument) return null;

        return PensionEntity.fromObject(pensionDocument.toObject());
    }

    async delete(id: string): Promise<PensionEntity | null> {
        const pensionDocument = await PensionModel.findByIdAndUpdate(
            id,
            { estado: false },
            { new: true },
        );

        if (!pensionDocument) return null;

        return PensionEntity.fromObject(pensionDocument.toObject());
    }
}