import { CounterModel } from "../../../data/mongo/models/system/counter.schema";
import { ProyectoModel } from "../../../data/mongo/models/parking/proyecto.schema";
import { ProyectoDatasource } from "../../../domain/datasources/parking/proyecto.datasource";
import { ProyectoEntity } from "../../../domain/entities/parking/proyecto.entity";
import { CustomError } from "../../../domain/errors/custom.error";

export class ProyectoMongoDatasource extends ProyectoDatasource {
    async create(proyecto: Omit<ProyectoEntity, "id">): Promise<ProyectoEntity> {
        const codigoProyecto =
            proyecto.codigoProyecto ?? (await this.getNextCodigoProyecto());
        const proyectoDocument = await ProyectoModel.create({
            ...proyecto,
            codigoProyecto,
        });
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

    private async getNextCodigoProyecto(): Promise<string> {
        await this.ensureProjectCounterInitialized();

        const counter = await CounterModel.findOneAndUpdate(
            { name: "proyecto_codigo" },
            { $inc: { seq: 1 } },
            { new: true, upsert: true, setDefaultsOnInsert: true },
        );

        const sequence = Number(counter.seq);
        if (sequence > 9999) {
            throw CustomError.badRequest(
                "Se alcanzo el limite de 9999 codigos de proyecto",
            );
        }

        return String(sequence).padStart(4, "0");
    }

    private async ensureProjectCounterInitialized(): Promise<void> {
        const existingCounter = await CounterModel.findOne({
            name: "proyecto_codigo",
        }).lean();
        if (existingCounter) return;

        const proyectos = await ProyectoModel.find({
            codigoProyecto: { $regex: /^\d{4}$/ },
        })
            .select("codigoProyecto")
            .lean();
        const maxSequence = proyectos.reduce((max, proyecto) => {
            const sequence = Number(proyecto.codigoProyecto);
            return Number.isFinite(sequence) && sequence > max ? sequence : max;
        }, 0);

        try {
            await CounterModel.create({
                name: "proyecto_codigo",
                seq: maxSequence,
            });
        } catch (error) {
            if ((error as { code?: number }).code !== 11000) throw error;
        }
    }
}
