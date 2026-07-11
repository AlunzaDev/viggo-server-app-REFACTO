import { ModuloEntity } from "../../../domain/entities/parking/modulo.entity";
import { CustomError } from "../../../domain/errors/custom.error";
import { ModuloRepository } from "../../../domain/repository/parking/modulo.repository";
import { ProyectoRepository } from "../../../domain/repository/parking/proyecto.repository";

export class ModuloService {
  constructor(
    private readonly moduloRepository: ModuloRepository,
    private readonly proyectoRepository: ProyectoRepository,
  ) {}

  async createModulo(modulo: Omit<ModuloEntity, "id">): Promise<ModuloEntity> {
    const proyecto = await this.proyectoRepository.findById(modulo.proyecto);

    if (!proyecto) {
      throw CustomError.badRequest("El proyecto asociado no existe");
    }

    const moduloExists = await this.moduloRepository.findByIdentificador(
      modulo.identificador,
    );

    if (moduloExists) {
      throw CustomError.badRequest(
        `El modulo con identificador '${modulo.identificador}' ya existe`,
      );
    }

    return this.moduloRepository.create(modulo);
  }

  async getModulos(): Promise<ModuloEntity[]> {
    return this.moduloRepository.getAll();
  }

  async getModuloById(id: string): Promise<ModuloEntity> {
    const modulo = await this.moduloRepository.findById(id);

    if (!modulo) {
      throw CustomError.notFound("Modulo no encontrado");
    }

    return modulo;
  }

  async getModulosByProyecto(proyectoId: string): Promise<ModuloEntity[]> {
    const proyecto = await this.proyectoRepository.findById(proyectoId);

    if (!proyecto) {
      throw CustomError.notFound("Proyecto no encontrado");
    }

    return this.moduloRepository.getByProyecto(proyectoId);
  }

  async updateModulo(
    id: string,
    modulo: Partial<Omit<ModuloEntity, "id">>,
  ): Promise<ModuloEntity> {
    const moduloUpdated = await this.moduloRepository.update(id, modulo);

    if (!moduloUpdated) {
      throw CustomError.notFound("Modulo no encontrado");
    }

    return moduloUpdated;
  }

  async updateModuloStatus(id: string, estado: boolean): Promise<ModuloEntity> {
    const moduloUpdated = await this.moduloRepository.update(id, { estado });

    if (!moduloUpdated) {
      throw CustomError.notFound("Modulo no encontrado");
    }

    return moduloUpdated;
  }

  async deleteModulo(id: string): Promise<ModuloEntity> {
    const moduloDeleted = await this.moduloRepository.delete(id);

    if (!moduloDeleted) {
      throw CustomError.notFound("Modulo no encontrado");
    }

    return moduloDeleted;
  }
}
