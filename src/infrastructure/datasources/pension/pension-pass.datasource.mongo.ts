import { PensionPassModel } from "../../../data/mongo/models/pension/pension-pass.schema";
import { PensionPassDatasource } from "../../../domain/datasources/pension/pension-pass.datasource";
import { PensionPassEntity } from "../../../domain/entities/pension/pension-pass.entity";

export class PensionPassMongoDatasource extends PensionPassDatasource {
    async create(pensionPass: Omit<PensionPassEntity, "id">): Promise<PensionPassEntity> {
        const pensionPassDocument = await PensionPassModel.create(pensionPass);
        return PensionPassEntity.fromObject(pensionPassDocument.toObject());
    }

    async findById(id: string): Promise<PensionPassEntity | null> {
        const pensionPassDocument = await PensionPassModel.findById(id);
        if (!pensionPassDocument) return null;

        return PensionPassEntity.fromObject(pensionPassDocument.toObject());
    }

    async findByIdPass(idPass: string): Promise<PensionPassEntity | null> {
        const pensionPassDocument = await PensionPassModel.findOne({ idPass });
        if (!pensionPassDocument) return null;

        return PensionPassEntity.fromObject(pensionPassDocument.toObject());
    }

    async getAll(): Promise<PensionPassEntity[]> {
        const pensionPasses = await PensionPassModel.find();
        return pensionPasses.map((pensionPass) =>
            PensionPassEntity.fromObject(pensionPass.toObject()),
        );
    }

    async getByPension(pensionId: string): Promise<PensionPassEntity[]> {
        const pensionPasses = await PensionPassModel.find({ pension: pensionId });
        return pensionPasses.map((pensionPass) =>
            PensionPassEntity.fromObject(pensionPass.toObject()),
        );
    }

    async getByUsuario(usuarioId: string): Promise<PensionPassEntity[]> {
        const pensionPasses = await PensionPassModel.find({ usuario: usuarioId });
        return pensionPasses.map((pensionPass) =>
            PensionPassEntity.fromObject(pensionPass.toObject()),
        );
    }

    async update(
        id: string,
        pensionPass: Partial<Omit<PensionPassEntity, "id">>,
    ): Promise<PensionPassEntity | null> {
        const pensionPassDocument = await PensionPassModel.findByIdAndUpdate(id, pensionPass, {
            new: true,
        });

        if (!pensionPassDocument) return null;

        return PensionPassEntity.fromObject(pensionPassDocument.toObject());
    }

    async delete(id: string): Promise<PensionPassEntity | null> {
        const pensionPassDocument = await PensionPassModel.findByIdAndDelete(id);

        if (!pensionPassDocument) return null;

        return PensionPassEntity.fromObject(pensionPassDocument.toObject());
    }
}
