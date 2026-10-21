import { ModuloSubmoduloDtoValues } from "../../../domain/dtos/parking/modulo-submodulo.dto";
import type { ModuloListQueryDto } from "../../../domain/dtos/parking/modulo-list-query.dto";
import { canAccessProject, type ProjectAccess } from "../../../domain/entities/auth/project-access";
import {
  ModuloCreateValues,
  ModuloEntity,
  ModuloSubmodulo,
  ModuloUpdateValues,
} from "../../../domain/entities/parking/modulo.entity";
import { CustomError } from "../../../domain/errors/custom.error";
import { ModuloRepository } from "../../../domain/repositories/parking/modulo.repository";
import { ProyectoRepository } from "../../../domain/repositories/parking/proyecto.repository";

/** Lowercase without accents, so "nandu" finds "Ñandú". */
const normalizeText = (value: string) =>
  value.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/**
 * The device catalog of each parking. Every operation receives the user's access and only
 * touches modules of parkings the user can see.
 */
export class ModuloCrudService {
  constructor(
    private readonly moduloRepository: ModuloRepository,
    private readonly proyectoRepository: ProyectoRepository,
  ) {}

  async createModulo(modulo: ModuloCreateValues, access: ProjectAccess): Promise<ModuloEntity> {
    this.ensureAccess(access, modulo.proyecto);
    const proyecto = await this.proyectoRepository.findById(modulo.proyecto);
    if (!proyecto) throw CustomError.badRequest("El proyecto asociado no existe");

    const moduloExists = await this.moduloRepository.findByIdentificador(modulo.identificador);
    if (moduloExists) throw CustomError.badRequest(`El modulo con identificador '${modulo.identificador}' ya existe`);

    return this.moduloRepository.create(modulo);
  }

  /** Modules of the user's parkings that match the filters and the free text. */
  async listModulos(query: ModuloListQueryDto, access: ProjectAccess): Promise<ModuloEntity[]> {
    if (query.proyecto) {
      this.ensureAccess(access, query.proyecto);
      const proyecto = await this.proyectoRepository.findById(query.proyecto);
      if (!proyecto) throw CustomError.notFound("Proyecto no encontrado");
    }
    const modulos = await this.moduloRepository.getFiltered({
      proyecto: query.proyecto,
      proyectos: access.all ? undefined : access.allowed,
      tipos: query.tipos,
      estado: query.estado,
    });
    if (!query.search) return modulos;
    const search = normalizeText(query.search);
    return modulos.filter((modulo) =>
      [modulo.nombre, modulo.identificador, modulo.ip ?? "", modulo.mac ?? "", modulo.ubicacion ?? "", modulo.descripcion ?? "", modulo.tipo]
        .some((value) => normalizeText(String(value ?? "")).includes(search)),
    );
  }

  /** A module of a parking the user can see (404 if it does not exist, 403 if not theirs). */
  async getModuloById(id: string, access: ProjectAccess): Promise<ModuloEntity> {
    const modulo = await this.moduloRepository.findById(id);
    if (!modulo) throw CustomError.notFound("Modulo no encontrado");
    this.ensureAccess(access, modulo.proyecto);
    return modulo;
  }

  async getModuloByIdentificador(identificador: string, access: ProjectAccess): Promise<ModuloEntity> {
    const modulo = await this.moduloRepository.findByIdentificador(identificador);
    if (!modulo) throw CustomError.notFound("Modulo no encontrado");
    this.ensureAccess(access, modulo.proyecto);
    return modulo;
  }

  async getModulosByProyecto(proyectoId: string, access: ProjectAccess): Promise<ModuloEntity[]> {
    this.ensureAccess(access, proyectoId);
    const proyecto = await this.proyectoRepository.findById(proyectoId);
    if (!proyecto) throw CustomError.notFound("Proyecto no encontrado");
    return this.moduloRepository.getByProyecto(proyectoId);
  }

  async updateModulo(id: string, modulo: ModuloUpdateValues, access: ProjectAccess): Promise<ModuloEntity> {
    const current = await this.getModuloById(id, access);
    // Moving it is allowed only to a parking the user also sees.
    if (modulo.proyecto) this.ensureAccess(access, modulo.proyecto);

    if (modulo.proyecto && modulo.proyecto !== current.proyecto) {
      const proyecto = await this.proyectoRepository.findById(modulo.proyecto);
      if (!proyecto) throw CustomError.badRequest("El proyecto asociado no existe");
    }

    if (modulo.identificador && modulo.identificador !== current.identificador) {
      const duplicate = await this.moduloRepository.findByIdentificador(modulo.identificador);
      if (duplicate && duplicate.id !== id) throw CustomError.badRequest(`El modulo con identificador '${modulo.identificador}' ya existe`);
    }

    const updated = await this.moduloRepository.update(id, modulo);
    if (!updated) throw CustomError.notFound("Modulo no encontrado");
    return updated;
  }

  async updateModuloStatus(id: string, estado: boolean, access: ProjectAccess): Promise<ModuloEntity> {
    await this.getModuloById(id, access);
    const updated = await this.moduloRepository.update(id, { estado });
    if (!updated) throw CustomError.notFound("Modulo no encontrado");
    return updated;
  }

  async getSubmodulos(id: string, access: ProjectAccess): Promise<ModuloSubmodulo[]> {
    await this.getModuloById(id, access);
    const submodulos = await this.moduloRepository.getSubmodulos(id);
    if (!submodulos) throw CustomError.notFound("Modulo no encontrado");
    return submodulos;
  }

  async addSubmodulo(id: string, submodulo: ModuloSubmoduloDtoValues, access: ProjectAccess): Promise<ModuloSubmodulo> {
    await this.getModuloById(id, access);
    const created = await this.moduloRepository.addSubmodulo(id, submodulo);
    if (!created) throw CustomError.notFound("Modulo no encontrado");
    return created;
  }

  async updateSubmodulo(id: string, submoduloId: string, submodulo: ModuloSubmoduloDtoValues, access: ProjectAccess): Promise<ModuloSubmodulo> {
    await this.getModuloById(id, access);
    const updated = await this.moduloRepository.updateSubmodulo(id, submoduloId, submodulo);
    if (!updated) throw CustomError.notFound("Submodulo no encontrado");
    return updated;
  }

  async deleteSubmodulo(id: string, submoduloId: string, access: ProjectAccess): Promise<ModuloEntity> {
    await this.getModuloById(id, access);
    const updated = await this.moduloRepository.deleteSubmodulo(id, submoduloId);
    if (!updated) throw CustomError.notFound("Submodulo no encontrado");
    return updated;
  }

  async deleteModulo(id: string, access: ProjectAccess): Promise<ModuloEntity> {
    await this.getModuloById(id, access);
    const deleted = await this.moduloRepository.delete(id);
    if (!deleted) throw CustomError.notFound("Modulo no encontrado");
    return deleted;
  }

  private ensureAccess(access: ProjectAccess, projectId: string) {
    if (!canAccessProject(access, projectId)) throw CustomError.forbidden("Forbidden");
  }
}
