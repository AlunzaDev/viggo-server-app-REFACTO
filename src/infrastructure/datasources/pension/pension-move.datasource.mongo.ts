import { PensionMoveModel } from "../../../data/mongo/models/pension/pension-move.schema";
import { PensionMoveDatasource } from "../../../domain/datasources/pension/pension-move.datasource";
import { PensionMoveEntity } from "../../../domain/entities/pension/pension-move.entity";

export class PensionMoveMongoDatasource extends PensionMoveDatasource {
    async create(pensionMove: Omit<PensionMoveEntity, "id">): Promise<PensionMoveEntity> {
        const pensionMoveDocument = await PensionMoveModel.create(pensionMove);
        return PensionMoveEntity.fromObject(pensionMoveDocument.toObject());
    }

    async findById(id: string): Promise<PensionMoveEntity | null> {
        const pensionMoveDocument = await PensionMoveModel.findById(id);
        if (!pensionMoveDocument) return null;

        return PensionMoveEntity.fromObject(pensionMoveDocument.toObject());
    }

    async getAll(): Promise<PensionMoveEntity[]> {
        const pensionMoves = await PensionMoveModel.find();
        return pensionMoves.map((pensionMove) =>
            PensionMoveEntity.fromObject(pensionMove.toObject()),
        );
    }

    async getByPensionPass(pensionPassId: string): Promise<PensionMoveEntity[]> {
        const pensionMoves = await PensionMoveModel.find({ pensionPass: pensionPassId });
        return pensionMoves.map((pensionMove) =>
            PensionMoveEntity.fromObject(pensionMove.toObject()),
        );
    }

    async getByProyecto(proyectoId: string): Promise<PensionMoveEntity[]> {
        const pensionMoves = await PensionMoveModel.find({ proyecto: proyectoId });
        return pensionMoves.map((pensionMove) =>
            PensionMoveEntity.fromObject(pensionMove.toObject()),
        );
    }

    async update(
        id: string,
        pensionMove: Partial<Omit<PensionMoveEntity, "id">>,
    ): Promise<PensionMoveEntity | null> {
        const pensionMoveDocument = await PensionMoveModel.findByIdAndUpdate(id, pensionMove, {
            new: true,
        });

        if (!pensionMoveDocument) return null;

        return PensionMoveEntity.fromObject(pensionMoveDocument.toObject());
    }

    async delete(id: string): Promise<PensionMoveEntity | null> {
        const pensionMoveDocument = await PensionMoveModel.findByIdAndDelete(id);

        if (!pensionMoveDocument) return null;

        return PensionMoveEntity.fromObject(pensionMoveDocument.toObject());
    }
}