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
    if (!pension) throw CustomError.badRequest("La pension asociada no existe");

    const duplicate = await this.pensionPassRepository.findByIdPass(pensionPass.idPass);
    if (duplicate) {
      throw CustomError.badRequest(
        `El pensionPass con idPass '${pensionPass.idPass}' ya existe`,
      );
    }

    return this.pensionPassRepository.create({
      ...pensionPass,
      antiPassback: true,
      inParking: false,
    });
  }

  getPensionPasses(): Promise<PensionPassEntity[]> {
    return this.pensionPassRepository.getAll();
  }

  async getPensionPassesByProyecto(proyectoId: string): Promise<PensionPassEntity[]> {
    const passes = await this.pensionPassRepository.getAll();
    const resolved = await Promise.all(
      passes.map(async (pass) => {
        const pension = await this.pensionRepository.findById(pass.pension);
        return pension?.proyecto === proyectoId ? pass : null;
      }),
    );
    return resolved.filter((pass): pass is PensionPassEntity => pass !== null);
  }

  async getPensionPassById(id: string): Promise<PensionPassEntity> {
    const pensionPass = await this.pensionPassRepository.findById(id);
    if (!pensionPass) throw CustomError.notFound("PensionPass no encontrado");
    return pensionPass;
  }

  async getPensionPassesByPension(pensionId: string): Promise<PensionPassEntity[]> {
    const pension = await this.pensionRepository.findById(pensionId);
    if (!pension) throw CustomError.notFound("Pension no encontrada");
    return this.pensionPassRepository.getByPension(pensionId);
  }

  getPensionPassesByUsuario(usuarioId: string): Promise<PensionPassEntity[]> {
    return this.pensionPassRepository.getByUsuario(usuarioId);
  }

  async getProyectoIdByPensionId(pensionId: string): Promise<string> {
    const pension = await this.pensionRepository.findById(pensionId);
    if (!pension) throw CustomError.notFound("Pension no encontrada");
    return pension.proyecto;
  }

  async getProyectoIdByPensionPassId(pensionPassId: string): Promise<string> {
    const pass = await this.getPensionPassById(pensionPassId);
    return this.getProyectoIdByPensionId(pass.pension);
  }

  async precontractPensionPass(
    usuarioId: string,
    pensionId: string,
    contractMonths = 1,
  ): Promise<PensionPassEntity> {
    const pension = await this.pensionRepository.findById(pensionId);
    if (!pension || !pension.estado) throw CustomError.notFound("Pension no encontrada");

    const existing = await this.pensionPassRepository.findByUsuarioAndPension(
      usuarioId,
      pensionId,
    );
    if (existing) {
      throw CustomError.badRequest("El usuario ya tiene una pension pass para esta pension");
    }

    const available = await this.pensionPassRepository.findAvailableByPension(pensionId);
    if (!available) throw CustomError.badRequest("No hay pension pass disponibles");

    const now = new Date();
    const months = Number.isInteger(contractMonths) && contractMonths > 0 ? contractMonths : 1;
    const end = new Date(now);
    end.setMonth(end.getMonth() + months);

    return this.updatePensionPass(available.id, {
      usuario: usuarioId,
      from: now.getTime(),
      to: end.getTime(),
      vigent: false,
    });
  }

  async renewPensionPass(
    usuarioId: string,
    pensionPassId: string,
    contractMonths = 1,
  ): Promise<PensionPassEntity> {
    const pass = await this.getPensionPassById(pensionPassId);
    this.ensureOwner(pass, usuarioId);

    const months = Number.isInteger(contractMonths) && contractMonths > 0 ? contractMonths : 1;
    const now = Date.now();
    const start = pass.vigent && pass.to > now ? new Date(pass.to) : new Date(now);
    const end = new Date(start);
    end.setMonth(end.getMonth() + months);

    return this.updatePensionPass(pass.id, {
      from: pass.from > 0 ? pass.from : now,
      to: end.getTime(),
    });
  }

  async contractPensionPass(
    usuarioId: string,
    pensionPassId: string,
  ): Promise<PensionPassEntity> {
    const pass = await this.getPensionPassById(pensionPassId);
    this.ensureOwner(pass, usuarioId);
    if (pass.from < 0 || pass.to < 0) {
      throw CustomError.badRequest("No existe un precontrato vigente");
    }
    return this.updatePensionPass(pass.id, { vigent: true });
  }

  async updatePensionPass(
    id: string,
    pensionPass: Partial<Omit<PensionPassEntity, "id">>,
  ): Promise<PensionPassEntity> {
    if (pensionPass.pension) {
      const pension = await this.pensionRepository.findById(pensionPass.pension);
      if (!pension) throw CustomError.badRequest("La pension asociada no existe");
    }

    const updated = await this.pensionPassRepository.update(id, pensionPass);
    if (!updated) throw CustomError.notFound("PensionPass no encontrado");
    return updated;
  }

  updatePensionPassStatus(id: string, estado: boolean): Promise<PensionPassEntity> {
    return this.updatePensionPass(id, { estado });
  }

  async deletePensionPass(id: string): Promise<PensionPassEntity> {
    const deleted = await this.pensionPassRepository.delete(id);
    if (!deleted) throw CustomError.notFound("PensionPass no encontrado");
    return deleted;
  }

  private ensureOwner(pass: PensionPassEntity, usuarioId: string): void {
    if (!pass.usuario || pass.usuario !== usuarioId) {
      throw CustomError.unauthorized("La pension pass no pertenece al usuario");
    }
  }
}
