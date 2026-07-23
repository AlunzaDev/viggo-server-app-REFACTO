import { ModuloModel } from "../../../data/mongo/models/parking/modulo.schema";
import {
  ModuloDatasource,
  ModuloFilters,
} from "../../../domain/datasources/parking/modulo.datasource";
import { ModuloEntity } from "../../../domain/entities/parking/modulo.entity";

export class ModuloMongoDatasource extends ModuloDatasource {
  async create(modulo: Omit<ModuloEntity, "id">): Promise<ModuloEntity> {
    const document = await ModuloModel.create(modulo);
    return ModuloEntity.fromObject(document.toObject());
  }

  async findById(id: string): Promise<ModuloEntity | null> {
    const document = await ModuloModel.findById(id);
    return document ? ModuloEntity.fromObject(document.toObject()) : null;
  }

  async findByIdentificador(identificador: string): Promise<ModuloEntity | null> {
    const document = await ModuloModel.findOne({ identificador });
    return document ? ModuloEntity.fromObject(document.toObject()) : null;
  }

  async getAll(): Promise<ModuloEntity[]> {
    const documents = await ModuloModel.find();
    return documents.map((item) => ModuloEntity.fromObject(item.toObject()));
  }

  async getFiltered(filters: ModuloFilters): Promise<ModuloEntity[]> {
    const query: Record<string, unknown> = {};
    if (filters.proyecto) query.proyecto = filters.proyecto;
    if (filters.tipo) query.tipo = filters.tipo;
    if (typeof filters.estado === "boolean") query.estado = filters.estado;
    const documents = await ModuloModel.find(query);
    return documents.map((item) => ModuloEntity.fromObject(item.toObject()));
  }

  async getByProyecto(proyectoId: string): Promise<ModuloEntity[]> {
    const documents = await ModuloModel.find({ proyecto: proyectoId });
    return documents.map((item) => ModuloEntity.fromObject(item.toObject()));
  }

  async update(
    id: string,
    modulo: Partial<Omit<ModuloEntity, "id">>,
  ): Promise<ModuloEntity | null> {
    const document = await ModuloModel.findByIdAndUpdate(id, modulo, {
      new: true,
      runValidators: true,
    });
    return document ? ModuloEntity.fromObject(document.toObject()) : null;
  }

  async delete(id: string): Promise<ModuloEntity | null> {
    const document = await ModuloModel.findByIdAndDelete(id);
    return document ? ModuloEntity.fromObject(document.toObject()) : null;
  }
}
