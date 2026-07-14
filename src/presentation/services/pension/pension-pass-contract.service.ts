import { PensionPassEntity } from "../../../domain/entities/pension/pension-pass.entity";
import { CustomError } from "../../../domain/errors/custom.error";
import { PensionPassRepository } from "../../../domain/repository/pension/pension-pass.repository";
import { PensionRepository } from "../../../domain/repository/pension/pension.repository";
import {
  PensionPassCardResponse,
  PensionPassResponseMapper,
} from "./pension-pass-response.mapper";

const PRECONTRACT_RELEASE_MS = 60 * 1000;

export class PensionPassContractService {
  constructor(
    private readonly pensionPassRepository: PensionPassRepository,
    private readonly pensionRepository: PensionRepository,
    private readonly responseMapper: PensionPassResponseMapper,
  ) {}

  async precontractPensionPass(
    usuarioId: string,
    pensionId: string,
    contractMonths = 1,
  ): Promise<PensionPassCardResponse> {
    const pension = await this.pensionRepository.findById(pensionId);

    if (!pension || !pension.estado) {
      throw CustomError.notFound("Pension no encontrada");
    }

    const userPass = await this.pensionPassRepository.findByUsuarioAndPension(
      usuarioId,
      pensionId,
    );

    if (userPass) {
      throw CustomError.badRequest(
        "El usuario ya tiene una pension pass para esta pension.",
      );
    }

    const pensionPass =
      await this.pensionPassRepository.findAvailableByPension(pensionId);

    if (!pensionPass) {
      throw CustomError.badRequest(
        `No hay pension pass disponibles en la pension ${pensionId}`,
      );
    }

    const now = new Date();
    const newTo = this.addMonths(now, contractMonths);
    const pensionPassUpdated = await this.updatePensionPass(pensionPass.id, {
      usuario: usuarioId,
      from: now.getTime(),
      to: newTo.getTime(),
    });

    this.releasePrecontractIfNotPaid(pensionPassUpdated.id);

    return this.responseMapper.toPensionPassCardResponse(pensionPassUpdated);
  }

  async renewPensionPass(
    usuarioId: string,
    pensionPassId: string,
    contractMonths = 1,
  ): Promise<PensionPassCardResponse> {
    const pensionPass = await this.getPensionPassById(pensionPassId);
    this.ensurePensionPassOwner(pensionPass, usuarioId);

    const now = new Date();
    const startDate =
      pensionPass.vigent && pensionPass.to !== -1
        ? new Date(pensionPass.to)
        : now;
    const fromDate =
      pensionPass.vigent && pensionPass.from !== -1
        ? new Date(pensionPass.from)
        : now;
    const newTo = this.addMonths(startDate, contractMonths);

    const pensionPassUpdated = await this.updatePensionPass(pensionPass.id, {
      from: fromDate.getTime(),
      to: newTo.getTime(),
    });

    return this.responseMapper.toPensionPassCardResponse(pensionPassUpdated);
  }

  async contractPensionPass(
    usuarioId: string,
    pensionPassId: string,
  ): Promise<PensionPassCardResponse> {
    const pensionPass = await this.getPensionPassById(pensionPassId);
    this.ensurePensionPassOwner(pensionPass, usuarioId);

    if (pensionPass.to === -1 || pensionPass.from === -1) {
      throw CustomError.badRequest("Su precontrato expiro, intente de nuevo");
    }

    const pensionPassUpdated = await this.updatePensionPass(pensionPass.id, {
      vigent: true,
    });

    return this.responseMapper.toPensionPassCardResponse(pensionPassUpdated);
  }

  private async getPensionPassById(id: string): Promise<PensionPassEntity> {
    const pensionPass = await this.pensionPassRepository.findById(id);

    if (!pensionPass) {
      throw CustomError.notFound("PensionPass no encontrado");
    }

    return pensionPass;
  }

  private async updatePensionPass(
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

  private addMonths(date: Date, months: number): Date {
    const safeMonths = Number.isFinite(months) && months > 0 ? months : 1;
    return new Date(
      date.getFullYear(),
      date.getMonth() + safeMonths,
      date.getDate(),
      date.getHours(),
      date.getMinutes(),
      date.getSeconds(),
    );
  }

  private ensurePensionPassOwner(
    pensionPass: PensionPassEntity,
    usuarioId: string,
  ): void {
    if (pensionPass.usuario && pensionPass.usuario !== usuarioId) {
      throw CustomError.unauthorized("La pension no pertenece al usuario");
    }
  }

  private releasePrecontractIfNotPaid(pensionPassId: string): void {
    setTimeout(async () => {
      const pensionPass =
        await this.pensionPassRepository.findById(pensionPassId);

      if (!pensionPass || pensionPass.vigent) return;

      await this.pensionPassRepository.update(pensionPass.id, {
        usuario: null,
        from: -1,
        to: -1,
      });
    }, PRECONTRACT_RELEASE_MS);
  }
}
