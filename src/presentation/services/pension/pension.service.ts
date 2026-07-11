import { PensionEntity } from "../../../domain/entities/pension/pension.entity";
import { CustomError } from "../../../domain/errors/custom.error";
import { PensionRepository } from "../../../domain/repository/pension/pension.repository";
import { ProyectoRepository } from "../../../domain/repository/parking/proyecto.repository";

export class PensionService {
  constructor(
    private readonly pensionRepository: PensionRepository,
    private readonly proyectoRepository: ProyectoRepository,
  ) {}

  async createPension(
    pension: Omit<PensionEntity, "id">,
  ): Promise<PensionEntity> {
    const proyecto = await this.proyectoRepository.findById(pension.proyecto);

    if (!proyecto) {
      throw CustomError.badRequest("El proyecto asociado no existe");
    }

    return this.pensionRepository.create(pension);
  }

  async getPensiones(): Promise<PensionEntity[]> {
    return this.pensionRepository.getAll();
  }

  async getPensionById(id: string): Promise<PensionEntity> {
    const pension = await this.pensionRepository.findById(id);

    if (!pension) {
      throw CustomError.notFound("Pension no encontrada");
    }

    return pension;
  }

  async getPensionesByProyecto(proyectoId: string): Promise<PensionEntity[]> {
    const proyecto = await this.proyectoRepository.findById(proyectoId);

    if (!proyecto) {
      throw CustomError.notFound("Proyecto no encontrado");
    }

    return this.pensionRepository.getByProyecto(proyectoId);
  }

  async updatePension(
    id: string,
    pension: Partial<Omit<PensionEntity, "id">>,
  ): Promise<PensionEntity> {
    const pensionUpdated = await this.pensionRepository.update(id, pension);

    if (!pensionUpdated) {
      throw CustomError.notFound("Pension no encontrada");
    }

    return pensionUpdated;
  }

  async updatePensionStatus(
    id: string,
    estado: boolean,
  ): Promise<PensionEntity> {
    const pensionUpdated = await this.pensionRepository.update(id, { estado });

    if (!pensionUpdated) {
      throw CustomError.notFound("Pension no encontrada");
    }

    return pensionUpdated;
  }

  async deletePension(id: string): Promise<PensionEntity> {
    const pensionDeleted = await this.pensionRepository.delete(id);

    if (!pensionDeleted) {
      throw CustomError.notFound("Pension no encontrada");
    }

    return pensionDeleted;
  }
}
