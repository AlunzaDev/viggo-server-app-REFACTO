import { PensionPassModel } from "../../../data/mongo/models/pension/pension-pass.schema";
import {
    PensionPassDatasource,
    PensionPassFinancialOperation,
} from "../../../domain/datasources/pension/pension-pass.datasource";
import { PensionPassEntity } from "../../../domain/entities/pension/pension-pass.entity";
import { UniqueConstraintError } from "../../../domain/errors/unique-constraint.error";

export class PensionPassMongoDatasource extends PensionPassDatasource {
    async findByFinancialOperationKey(key: string, pensionPassId?: string) {
        const document = await PensionPassModel.findOne({
            ...(pensionPassId !== undefined ? { _id: pensionPassId } : {}),
            "financialOperations.key": key,
        }).lean();
        if (!document) return null;

        const operation = (document.financialOperations as PensionPassFinancialOperation[] | undefined)
            ?.find((item) => item.key === key) ?? null;
        return { pensionPass: PensionPassEntity.fromObject(document), operation };
    }

    async findActiveByIdAndUsuario(id: string, usuarioId: string): Promise<PensionPassEntity | null> {
        const document = await PensionPassModel.findOne({ _id: id, usuario: usuarioId, estado: true }).lean();
        return document ? PensionPassEntity.fromObject(document) : null;
    }

    async claimAvailable(input: {
        pensionId: string;
        usuarioId: string;
        from: number;
        to: number;
        operation: PensionPassFinancialOperation;
    }): Promise<PensionPassEntity | null> {
        try {
            const document = await PensionPassModel.findOneAndUpdate(
                { pension: input.pensionId, usuario: null, from: -1, to: -1, estado: true },
                {
                    $set: { usuario: input.usuarioId, from: input.from, to: input.to, vigent: false },
                    $push: { financialOperations: input.operation },
                },
                { new: true },
            );
            return document ? PensionPassEntity.fromObject(document.toObject()) : null;
        } catch (error) {
            throw UniqueConstraintError.fromMongo(error) ?? error;
        }
    }

    async applyRenewal(input: {
        id: string;
        usuarioId: string;
        expectedTo: number;
        from: number;
        to: number;
        operation: PensionPassFinancialOperation;
    }): Promise<PensionPassEntity | null> {
        const document = await PensionPassModel.findOneAndUpdate(
            {
                _id: input.id,
                usuario: input.usuarioId,
                estado: true,
                to: input.expectedTo,
                "financialOperations.key": { $ne: input.operation.key },
            },
            {
                $set: { from: input.from, to: input.to },
                $push: { financialOperations: input.operation },
            },
            { new: true },
        );
        return document ? PensionPassEntity.fromObject(document.toObject()) : null;
    }

    async applyContract(input: {
        id: string;
        usuarioId: string;
        expectedFrom: number;
        expectedTo: number;
        operation: PensionPassFinancialOperation;
    }): Promise<PensionPassEntity | null> {
        const document = await PensionPassModel.findOneAndUpdate(
            {
                _id: input.id,
                usuario: input.usuarioId,
                estado: true,
                vigent: false,
                from: input.expectedFrom,
                to: input.expectedTo,
                "financialOperations.key": { $ne: input.operation.key },
            },
            {
                $set: { vigent: true },
                $push: { financialOperations: input.operation },
            },
            { new: true },
        );
        return document ? PensionPassEntity.fromObject(document.toObject()) : null;
    }

    async cancel(input: {
        id: string;
        cancelledBy: string;
        reason: string;
        cancelledAt: number;
    }): Promise<PensionPassEntity | null> {
        const document = await PensionPassModel.findOneAndUpdate(
            { _id: input.id, estado: true },
            {
                $set: {
                    estado: false,
                    vigent: false,
                    cancelledAt: input.cancelledAt,
                    cancelledBy: input.cancelledBy,
                    cancellationReason: input.reason,
                },
            },
            { new: true },
        );
        return document ? PensionPassEntity.fromObject(document.toObject()) : null;
    }

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

    async findAvailableByPension(pensionId: string): Promise<PensionPassEntity | null> {
        const pensionPassDocument = await PensionPassModel.findOne({
            pension: pensionId,
            usuario: null,
            from: -1,
            to: -1,
            estado: true,
        });

        if (!pensionPassDocument) return null;

        return PensionPassEntity.fromObject(pensionPassDocument.toObject());
    }

    async findByUsuarioAndPension(
        usuarioId: string,
        pensionId: string,
    ): Promise<PensionPassEntity | null> {
        const pensionPassDocument = await PensionPassModel.findOne({
            usuario: usuarioId,
            pension: pensionId,
            estado: true,
        });

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
