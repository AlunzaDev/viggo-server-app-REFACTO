import type { PensionPassFinancialOperation } from "../../../domain/datasources/pension/pension-pass.datasource";
import { PensionPassEntity } from "../../../domain/entities/pension/pension-pass.entity";
import { CustomError } from "../../../domain/errors/custom.error";
import { PensionPassRepository } from "../../../domain/repositories/pension/pension-pass.repository";
import { PensionRepository } from "../../../domain/repositories/pension/pension.repository";
import { UniqueConstraintError } from "../../../domain/errors/unique-constraint.error";

const validKey = (value: string) => /^[A-Za-z0-9._:-]{16,128}$/.test(value);

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

  /** Passages of the user's own pass; someone else's pass looks like no pass at all. */
  async getMyPensionPassMovements(usuarioId: string, id: string, range: { from?: number; to?: number; page: number; limit: number }) {
    const pensionPass = await this.pensionPassRepository.findById(id);
    if (!pensionPass || pensionPass.usuario !== usuarioId) throw CustomError.notFound("PensionPass no encontrado");
    const pension = await this.pensionRepository.findById(pensionPass.pension);
    if (!pension) throw CustomError.notFound("Pension no encontrada");
    return this.pensionPassRepository.listMovements({ pensionPassId: id, proyectoId: pension.proyecto, ...range });
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
    idempotencyKey = "",
  ): Promise<PensionPassEntity> {
    if (!validKey(idempotencyKey)) throw CustomError.badRequest("Idempotency-Key invalida");
    if (!Number.isInteger(contractMonths) || contractMonths < 1 || contractMonths > 24) {
      throw CustomError.badRequest("contractMonths debe estar entre 1 y 24");
    }
    const months = contractMonths;
    const replay = await this.pensionPassRepository.findByFinancialOperationKey(idempotencyKey);
    if (replay) {
      if (!this.isSamePrecontract(replay, usuarioId, pensionId, months)) {
        throw CustomError.conflict("La clave ya fue usada para otra operacion");
      }
      return replay.pensionPass;
    }
    const pension = await this.pensionRepository.findById(pensionId);
    if (!pension || !pension.estado) throw CustomError.notFound("Pension no encontrada");

    const existing = await this.pensionPassRepository.findByUsuarioAndPension(
      usuarioId,
      pensionId,
    );
    if (existing) {
      throw CustomError.badRequest("El usuario ya tiene una pension pass para esta pension");
    }

    const now = new Date();
    const end = new Date(now);
    end.setMonth(end.getMonth() + months);

    try {
      const claimed = await this.pensionPassRepository.claimAvailable({
        pensionId,
        usuarioId,
        from: now.getTime(),
        to: end.getTime(),
        operation: { key: idempotencyKey, type: "precontract", months, from: now.getTime(), to: end.getTime(), processedAt: Date.now() },
      });
      if (!claimed) throw CustomError.conflict("No hay pension pass disponibles");
      return claimed;
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        const duplicate = await this.pensionPassRepository.findByFinancialOperationKey(idempotencyKey);
        if (duplicate && this.isSamePrecontract(duplicate, usuarioId, pensionId, months)) {
          return duplicate.pensionPass;
        }
        if (duplicate) throw CustomError.conflict("La clave ya fue usada para otra operacion");
        throw CustomError.conflict("El usuario ya tiene una pension pass para esta pension");
      }
      throw error;
    }
  }

  async renewPensionPass(
    usuarioId: string,
    pensionPassId: string,
    contractMonths = 1,
    idempotencyKey = "",
  ): Promise<PensionPassEntity> {
    if (!validKey(idempotencyKey)) throw CustomError.badRequest("Idempotency-Key invalida");
    if (!Number.isInteger(contractMonths) || contractMonths < 1 || contractMonths > 24) {
      throw CustomError.badRequest("contractMonths debe estar entre 1 y 24");
    }
    const pass = await this.getPensionPassById(pensionPassId);
    this.ensureOwner(pass, usuarioId);
    const replay = await this.pensionPassRepository.findByFinancialOperationKey(idempotencyKey, pensionPassId);
    if (replay) return replay.pensionPass;

    const months = contractMonths;
    const now = Date.now();
    const start = pass.vigent && pass.to > now ? new Date(pass.to) : new Date(now);
    const end = new Date(start);
    end.setMonth(end.getMonth() + months);

    const from = pass.from > 0 ? pass.from : now;
    const updated = await this.pensionPassRepository.applyRenewal({
      id: pass.id,
      usuarioId,
      expectedTo: pass.to,
      from,
      to: end.getTime(),
      operation: { key: idempotencyKey, type: "renew", months, from, to: end.getTime(), processedAt: Date.now() },
    });
    if (!updated) throw CustomError.conflict("La pension cambio mientras se procesaba; reintenta con una nueva clave");
    return updated;
  }

  async contractPensionPass(
    usuarioId: string,
    pensionPassId: string,
    idempotencyKey = "",
  ): Promise<PensionPassEntity> {
    if (!validKey(idempotencyKey)) throw CustomError.badRequest("Idempotency-Key invalida");
    const pass = await this.getPensionPassById(pensionPassId);
    this.ensureOwner(pass, usuarioId);
    const replay = await this.pensionPassRepository.findByFinancialOperationKey(idempotencyKey, pensionPassId);
    if (replay) return replay.pensionPass;
    if (pass.from < 0 || pass.to < 0) {
      throw CustomError.badRequest("No existe un precontrato vigente");
    }
    const updated = await this.pensionPassRepository.applyContract({
      id: pass.id,
      usuarioId,
      expectedFrom: pass.from,
      expectedTo: pass.to,
      operation: { key: idempotencyKey, type: "contract", months: 0, from: pass.from, to: pass.to, processedAt: Date.now() },
    });
    if (!updated) throw CustomError.conflict("La pension ya fue contratada o cambio durante el proceso");
    return updated;
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

  async deletePensionPass(id: string, cancelledBy: string, reason: string): Promise<PensionPassEntity> {
    const cancelled = await this.pensionPassRepository.cancel({
      id,
      cancelledBy,
      reason: reason.trim(),
      cancelledAt: Date.now(),
    });
    if (!cancelled) throw CustomError.notFound("PensionPass no encontrado o ya cancelado");
    return cancelled;
  }

  private isSamePrecontract(
    replay: { pensionPass: PensionPassEntity; operation: PensionPassFinancialOperation | null },
    usuarioId: string,
    pensionId: string,
    months: number,
  ): boolean {
    return String(replay.pensionPass.usuario ?? "") === usuarioId &&
      replay.pensionPass.pension === pensionId &&
      replay.operation?.type === "precontract" &&
      replay.operation.months === months;
  }

  private ensureOwner(pass: PensionPassEntity, usuarioId: string): void {
    if (!pass.usuario || pass.usuario !== usuarioId) {
      throw CustomError.unauthorized("La pension pass no pertenece al usuario");
    }
  }
}
