import { PensionPassEntity } from "../../../domain/entities/pension/pension-pass.entity";
import { CustomError } from "../../../domain/errors/custom.error";
import { PensionPassRepository } from "../../../domain/repository/pension/pension-pass.repository";
import { PensionRepository } from "../../../domain/repository/pension/pension.repository";

export class PensionPassService {
  constructor(
    private readonly pensionPassRepository: PensionPassRepository,
    private readonly pensionRepository: PensionRepository,
  ) {}

  async createPensionPass(
    pensionPass: Omit<PensionPassEntity, "id">,
  ): Promise<PensionPassEntity> {
    const pension = await this.pensionRepository.findById(pensionPass.pension);

    if (!pension) {
      throw CustomError.badRequest("La pension asociada no existe");
    }

    const pensionPassExists = await this.pensionPassRepository.findByIdPass(
      pensionPass.idPass,
    );

    if (pensionPassExists) {
      throw CustomError.badRequest(
        `El pensionPass con idPass '${pensionPass.idPass}' ya existe`,
      );
    }

    return this.pensionPassRepository.create(pensionPass);
  }

  async getPensionPasses(): Promise<PensionPassEntity[]> {
    return this.pensionPassRepository.getAll();
  }

  async getPensionPassById(id: string): Promise<PensionPassEntity> {
    const pensionPass = await this.pensionPassRepository.findById(id);

    if (!pensionPass) {
      throw CustomError.notFound("PensionPass no encontrado");
    }

    return pensionPass;
  }

  async getPensionPassesByPension(
    pensionId: string,
  ): Promise<PensionPassEntity[]> {
    const pension = await this.pensionRepository.findById(pensionId);

    if (!pension) {
      throw CustomError.notFound("Pension no encontrada");
    }

    return this.pensionPassRepository.getByPension(pensionId);
  }

  async getPensionPassesByUsuario(
    usuarioId: string,
  ): Promise<PensionPassEntity[]> {
    return this.pensionPassRepository.getByUsuario(usuarioId);
  }

  async updatePensionPass(
    id: string,
    pensionPass: Partial<Omit<PensionPassEntity, "id">>,
  ): Promise<PensionPassEntity> {
    const pensionPassUpdated = await this.pensionPassRepository.update(
      id,
      pensionPass,
    );

    if (!pensionPassUpdated) {
      throw CustomError.notFound("PensionPass no encontrado");
    }

    return pensionPassUpdated;
  }

  async updatePensionPassStatus(
    id: string,
    estado: boolean,
  ): Promise<PensionPassEntity> {
    const pensionPassUpdated = await this.pensionPassRepository.update(id, {
      estado,
    });

    if (!pensionPassUpdated) {
      throw CustomError.notFound("PensionPass no encontrado");
    }

    return pensionPassUpdated;
  }

  async deletePensionPass(id: string): Promise<PensionPassEntity> {
    const pensionPassDeleted = await this.pensionPassRepository.delete(id);

    if (!pensionPassDeleted) {
      throw CustomError.notFound("PensionPass no encontrado");
    }

    return pensionPassDeleted;
  }
}
