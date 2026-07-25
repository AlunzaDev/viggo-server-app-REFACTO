import { ModuloModel } from "../../../data/mongo/models/parking/modulo.schema";
import {
  ModuloDatasource,
  ModuloFilters,
} from "../../../domain/datasources/parking/modulo.datasource";
import { ModuloSubmoduloDtoValues } from "../../../domain/dtos/parking/modulo-submodulo.dto";
import { ModuloEntity, ModuloSubmodulo } from "../../../domain/entities/parking/modulo.entity";
import { CustomError } from "../../../domain/errors/custom.error";

export class ModuloMongoDatasource extends ModuloDatasource {
  private normalizeSubmoduloId(value: unknown): string {
    if (typeof value === "string") return value.trim();
    if (!value || typeof value !== "object") return "";
    const source = value as Record<string, unknown>;
    return String(source.$oid ?? source.id ?? source._id ?? value).trim();
  }

  private resolveSubmodulo(
    modulo: ModuloEntity,
    submoduloId: string,
  ): ModuloSubmodulo | null {
    return modulo.submodulos.find((item) => item.submoduloId === submoduloId) ?? null;
  }

  private async getDocumentOrThrow(id: string) {
    const document = await ModuloModel.findById(id);
    if (!document) throw CustomError.notFound("Modulo no encontrado");
    return document;
  }

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

  async getSubmodulos(id: string): Promise<ModuloSubmodulo[] | null> {
    const document = await ModuloModel.findById(id);
    if (!document) return null;
    return ModuloEntity.fromObject(document.toObject()).submodulos;
  }

  async addSubmodulo(
    id: string,
    submodulo: ModuloSubmoduloDtoValues,
  ): Promise<ModuloSubmodulo | null> {
    const document = await this.getDocumentOrThrow(id);
    const rawSubmodulos = Array.isArray(document.submodulos) ? document.submodulos : [];
    const submoduloId = submodulo.submoduloId || undefined;

    if (
      submoduloId &&
      rawSubmodulos.some((item: Record<string, unknown>) =>
        this.normalizeSubmoduloId(item.submoduloId ?? item._id) === submoduloId,
      )
    ) {
      throw CustomError.badRequest("Ya existe un submodulo con ese identificador");
    }

    document.submodulos.push({
      ...(submoduloId ? { submoduloId } : {}),
      nombre: submodulo.nombre,
      tipo: submodulo.tipo,
      identificador: submodulo.identificador ?? "",
      ip: submodulo.ip ?? "",
      mac: submodulo.mac ?? "",
      descripcion: submodulo.descripcion ?? "",
      estado: submodulo.estado ?? true,
    });
    await document.save();

    const updated = ModuloEntity.fromObject(document.toObject());
    return updated.submodulos[updated.submodulos.length - 1] ?? null;
  }

  async updateSubmodulo(
    id: string,
    submoduloId: string,
    submodulo: ModuloSubmoduloDtoValues,
  ): Promise<ModuloSubmodulo | null> {
    const document = await this.getDocumentOrThrow(id);
    const rawSubmodulos = Array.isArray(document.submodulos) ? document.submodulos : [];
    const index = rawSubmodulos.findIndex((item: Record<string, unknown>) =>
      this.normalizeSubmoduloId(item.submoduloId ?? item._id) === submoduloId,
    );

    if (index < 0) {
      throw CustomError.notFound("Submodulo no encontrado");
    }

    const nextSubmoduloId = submodulo.submoduloId || submoduloId;
    const duplicated = rawSubmodulos.some((item: Record<string, unknown>, itemIndex: number) =>
      itemIndex !== index &&
      this.normalizeSubmoduloId(item.submoduloId ?? item._id) === nextSubmoduloId,
    );

    if (duplicated) {
      throw CustomError.badRequest("Ya existe un submodulo con ese identificador");
    }

    rawSubmodulos[index].submoduloId = nextSubmoduloId;
    rawSubmodulos[index].nombre = submodulo.nombre;
    rawSubmodulos[index].tipo = submodulo.tipo;
    rawSubmodulos[index].identificador = submodulo.identificador ?? "";
    rawSubmodulos[index].ip = submodulo.ip ?? "";
    rawSubmodulos[index].mac = submodulo.mac ?? "";
    rawSubmodulos[index].descripcion = submodulo.descripcion ?? "";
    rawSubmodulos[index].estado = submodulo.estado ?? true;
    await document.save();

    const updated = ModuloEntity.fromObject(document.toObject());
    return this.resolveSubmodulo(updated, nextSubmoduloId);
  }

  async deleteSubmodulo(id: string, submoduloId: string): Promise<ModuloEntity | null> {
    const document = await this.getDocumentOrThrow(id);
    const rawSubmodulos = Array.isArray(document.submodulos) ? document.submodulos : [];
    const index = rawSubmodulos.findIndex((item: Record<string, unknown>) =>
      this.normalizeSubmoduloId(item.submoduloId ?? item._id) === submoduloId,
    );

    if (index < 0) {
      throw CustomError.notFound("Submodulo no encontrado");
    }

    rawSubmodulos.splice(index, 1);
    await document.save();
    return ModuloEntity.fromObject(document.toObject());
  }

  async delete(id: string): Promise<ModuloEntity | null> {
    const document = await ModuloModel.findByIdAndDelete(id);
    return document ? ModuloEntity.fromObject(document.toObject()) : null;
  }
}
