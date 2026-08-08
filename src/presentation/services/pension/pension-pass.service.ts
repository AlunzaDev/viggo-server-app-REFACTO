import { PensionPassEntity } from "../../../domain/entities/pension/pension-pass.entity";
import { CustomError } from "../../../domain/errors/custom.error";
import { PensionPassRepository } from "../../../domain/repository/pension/pension-pass.repository";
import { PensionRepository } from "../../../domain/repository/pension/pension.repository";
import { PensionPassModel } from "../../../data/mongo/models/pension/pension-pass.schema";

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
    const replay = await PensionPassModel.findOne({ "financialOperations.key": idempotencyKey }).lean();
    if (replay) {
      const operation = (replay.financialOperations as Array<{ key?: string; type?: string; months?: number }> | undefined)
        ?.find((item) => item.key === idempotencyKey);
      if (String(replay.usuario ?? "") !== usuarioId || String(replay.pension) !== pensionId || operation?.type !== "precontract" || operation.months !== months) {
        throw CustomError.conflict("La clave ya fue usada para otra operacion");
      }
      return PensionPassEntity.fromObject(replay);
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
      const claimed = await PensionPassModel.findOneAndUpdate(
        { pension: pensionId, usuario: null, from: -1, to: -1, estado: true },
        {
          $set: { usuario: usuarioId, from: now.getTime(), to: end.getTime(), vigent: false },
          $push: { financialOperations: { key: idempotencyKey, type: "precontract", months, from: now.getTime(), to: end.getTime(), processedAt: Date.now() } },
        },
        { new: true },
      );
      if (!claimed) throw CustomError.conflict("No hay pension pass disponibles");
      return PensionPassEntity.fromObject(claimed.toObject());
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        const duplicate = await PensionPassModel.findOne({ "financialOperations.key": idempotencyKey }).lean();
        const operation = (duplicate?.financialOperations as Array<{ key?: string; type?: string; months?: number }> | undefined)
          ?.find((item) => item.key === idempotencyKey);
        if (duplicate && String(duplicate.usuario ?? "") === usuarioId && String(duplicate.pension) === pensionId && operation?.type === "precontract" && operation.months === months) {
          return PensionPassEntity.fromObject(duplicate);
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
    const replay = await PensionPassModel.findOne({ _id: pensionPassId, "financialOperations.key": idempotencyKey });
    if (replay) return PensionPassEntity.fromObject(replay.toObject());

    const months = contractMonths;
    const now = Date.now();
    const start = pass.vigent && pass.to > now ? new Date(pass.to) : new Date(now);
    const end = new Date(start);
    end.setMonth(end.getMonth() + months);

    const updated = await PensionPassModel.findOneAndUpdate(
      { _id: pass.id, usuario: usuarioId, estado: true, to: pass.to, "financialOperations.key": { $ne: idempotencyKey } },
      {
        $set: { from: pass.from > 0 ? pass.from : now, to: end.getTime() },
        $push: { financialOperations: { key: idempotencyKey, type: "renew", months, from: pass.from > 0 ? pass.from : now, to: end.getTime(), processedAt: Date.now() } },
      },
      { new: true },
    );
    if (!updated) throw CustomError.conflict("La pension cambio mientras se procesaba; reintenta con una nueva clave");
    return PensionPassEntity.fromObject(updated.toObject());
  }

  async contractPensionPass(
    usuarioId: string,
    pensionPassId: string,
    idempotencyKey = "",
  ): Promise<PensionPassEntity> {
    if (!validKey(idempotencyKey)) throw CustomError.badRequest("Idempotency-Key invalida");
    const pass = await this.getPensionPassById(pensionPassId);
    this.ensureOwner(pass, usuarioId);
    const replay = await PensionPassModel.findOne({ _id: pensionPassId, "financialOperations.key": idempotencyKey });
    if (replay) return PensionPassEntity.fromObject(replay.toObject());
    if (pass.from < 0 || pass.to < 0) {
      throw CustomError.badRequest("No existe un precontrato vigente");
    }
    const updated = await PensionPassModel.findOneAndUpdate(
      { _id: pass.id, usuario: usuarioId, estado: true, vigent: false, from: pass.from, to: pass.to, "financialOperations.key": { $ne: idempotencyKey } },
      {
        $set: { vigent: true },
        $push: { financialOperations: { key: idempotencyKey, type: "contract", months: 0, from: pass.from, to: pass.to, processedAt: Date.now() } },
      },
      { new: true },
    );
    if (!updated) throw CustomError.conflict("La pension ya fue contratada o cambio durante el proceso");
    return PensionPassEntity.fromObject(updated.toObject());
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
    const cancelled = await PensionPassModel.findOneAndUpdate(
      { _id: id, estado: true },
      { $set: { estado: false, vigent: false, cancelledAt: Date.now(), cancelledBy, cancellationReason: reason.trim() } },
      { new: true },
    );
    if (!cancelled) throw CustomError.notFound("PensionPass no encontrado o ya cancelado");
    return PensionPassEntity.fromObject(cancelled.toObject());
  }

  private ensureOwner(pass: PensionPassEntity, usuarioId: string): void {
    if (!pass.usuario || pass.usuario !== usuarioId) {
      throw CustomError.unauthorized("La pension pass no pertenece al usuario");
    }
  }
}
