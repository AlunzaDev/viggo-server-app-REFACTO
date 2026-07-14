import { PensionPassEntity } from "../../../domain/entities/pension/pension-pass.entity";
import { CustomError } from "../../../domain/errors/custom.error";
import { ModuloRepository } from "../../../domain/repository/parking/modulo.repository";
import { ProyectoRepository } from "../../../domain/repository/parking/proyecto.repository";
import { PensionMoveRepository } from "../../../domain/repository/pension/pension-move.repository";
import { PensionPassRepository } from "../../../domain/repository/pension/pension-pass.repository";
import { PensionRepository } from "../../../domain/repository/pension/pension.repository";
import { PensionPassAccessService } from "./pension-pass-access.service";
import { PensionPassContractService } from "./pension-pass-contract.service";
import {
  PensionMoveResponse,
  PensionPassCardResponse,
  PensionPassResponseMapper,
} from "./pension-pass-response.mapper";

export class PensionPassService {
  private readonly responseMapper: PensionPassResponseMapper;
  private readonly contractService: PensionPassContractService;
  private readonly accessService: PensionPassAccessService;

  constructor(
    private readonly pensionPassRepository: PensionPassRepository,
    private readonly pensionRepository: PensionRepository,
    proyectoRepository: ProyectoRepository,
    moduloRepository: ModuloRepository,
    private readonly pensionMoveRepository: PensionMoveRepository,
  ) {
    this.responseMapper = new PensionPassResponseMapper(
      pensionRepository,
      proyectoRepository,
      moduloRepository,
    );
    this.contractService = new PensionPassContractService(
      pensionPassRepository,
      pensionRepository,
      this.responseMapper,
    );
    this.accessService = new PensionPassAccessService(
      pensionPassRepository,
      pensionRepository,
      moduloRepository,
      pensionMoveRepository,
      this.responseMapper,
    );
  }

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

  getPensionPasses(): Promise<PensionPassEntity[]> {
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

  getPensionPassesByUsuario(usuarioId: string): Promise<PensionPassEntity[]> {
    return this.pensionPassRepository.getByUsuario(usuarioId);
  }

  async getPensionPassCardsByUsuario(
    usuarioId: string,
  ): Promise<PensionPassCardResponse[]> {
    const pensionPasses = await this.getPensionPassesByUsuario(usuarioId);

    return Promise.all(
      pensionPasses.map((pensionPass) =>
        this.responseMapper.toPensionPassCardResponse(pensionPass),
      ),
    );
  }

  async getPensionPassCardById(id: string): Promise<PensionPassCardResponse> {
    const pensionPass = await this.getPensionPassById(id);
    return this.responseMapper.toPensionPassCardResponse(pensionPass);
  }

  async getPensionMovesByPensionPass(
    pensionPassId: string,
  ): Promise<{ total: number; pensionMoves: PensionMoveResponse[] }> {
    await this.getPensionPassById(pensionPassId);

    const pensionMoves =
      await this.pensionMoveRepository.getByPensionPass(pensionPassId);
    const response = await Promise.all(
      pensionMoves.map((pensionMove) =>
        this.responseMapper.toPensionMoveResponse(pensionMove),
      ),
    );

    return {
      total: response.length,
      pensionMoves: response,
    };
  }

  precontractPensionPass(
    usuarioId: string,
    pensionId: string,
    contractMonths = 1,
  ): Promise<PensionPassCardResponse> {
    return this.contractService.precontractPensionPass(
      usuarioId,
      pensionId,
      contractMonths,
    );
  }

  renewPensionPass(
    usuarioId: string,
    pensionPassId: string,
    contractMonths = 1,
  ): Promise<PensionPassCardResponse> {
    return this.contractService.renewPensionPass(
      usuarioId,
      pensionPassId,
      contractMonths,
    );
  }

  contractPensionPass(
    usuarioId: string,
    pensionPassId: string,
  ): Promise<PensionPassCardResponse> {
    return this.contractService.contractPensionPass(usuarioId, pensionPassId);
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

  openBarrierWithPensionPass(
    usuarioId: string,
    pensionPassId: string,
    moduleToken: string,
  ): Promise<PensionMoveResponse> {
    return this.accessService.openBarrierWithPensionPass(
      usuarioId,
      pensionPassId,
      moduleToken,
    );
  }
}
