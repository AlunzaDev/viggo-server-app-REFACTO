import { ModuloModel } from "../../../data/mongo/models/parking/modulo.schema";
import { CustomError } from "../../../domain/errors/custom.error";
import {
  CashRegisterCountEntity,
  CashRegisterCountLine,
} from "../../../domain/entities/cash-register/cash-register-count.entity";
import {
  CashRegisterCutEntity,
  CashRegisterCutStatus,
} from "../../../domain/entities/cash-register/cash-register-cut.entity";
import {
  CashRegisterMovementDirection,
  CashRegisterMovementType,
  CashRegisterMovementEntity,
} from "../../../domain/entities/cash-register/cash-register-movement.entity";
import { CashRegisterShiftEntity } from "../../../domain/entities/cash-register/cash-register-shift.entity";
import { CashRegisterCountRepository } from "../../../domain/repository/cash-register/cash-register-count.repository";
import { CashRegisterCutRepository } from "../../../domain/repository/cash-register/cash-register-cut.repository";
import { CashRegisterMovementRepository } from "../../../domain/repository/cash-register/cash-register-movement.repository";
import { CashRegisterShiftRepository } from "../../../domain/repository/cash-register/cash-register-shift.repository";

export interface CashRegisterActorContext {
  userId: string;
  userName?: string;
  allowedProjectIds: string[];
  isSuperAdmin: boolean;
}

interface OpenShiftInput {
  moduloId: string;
  openingAmount: number;
  notes?: string;
}

interface RegisterMovementInput {
  type: CashRegisterMovementType;
  direction?: CashRegisterMovementDirection;
  concept: string;
  amount: number;
  notes?: string;
  metadata?: Record<string, unknown>;
}

interface SaveCountInput {
  denominations: Array<{
    label: string;
    value: number;
    quantity: number;
  }>;
  notes?: string;
}

export class CashRegisterService {
  constructor(
    private readonly shiftRepository: CashRegisterShiftRepository,
    private readonly movementRepository: CashRegisterMovementRepository,
    private readonly countRepository: CashRegisterCountRepository,
    private readonly cutRepository: CashRegisterCutRepository,
  ) {}

  async openShift(input: OpenShiftInput, actor: CashRegisterActorContext) {
    const modulo = await this.resolveModulo(input.moduloId);
    this.ensureProjectAccess(String(modulo.get("proyecto") ?? ""), actor);

    const [openShiftForModulo, openShiftForUser] = await Promise.all([
      this.shiftRepository.findOpenByModuloId(String(modulo._id)),
      this.shiftRepository.findOpenByUserId(actor.userId),
    ]);

    if (openShiftForModulo) {
      throw CustomError.badRequest("La caja ya tiene un turno abierto");
    }

    if (openShiftForUser) {
      throw CustomError.badRequest(
        "El usuario ya tiene un turno abierto en otra caja",
      );
    }

    const now = Date.now();
    const shift = await this.shiftRepository.create({
      proyectoId: String(modulo.get("proyecto") ?? ""),
      moduloId: String(modulo._id),
      moduloIdentificador: String(modulo.get("identificador") ?? "").trim() || undefined,
      moduloNombre: String(modulo.get("nombre") ?? "").trim() || undefined,
      openedByUserId: actor.userId,
      openedByUserName: actor.userName,
      status: "open",
      openingAmount: Number(input.openingAmount),
      openedAt: now,
      notes: input.notes?.trim() || undefined,
      metadata: {
        source: "manual_open",
      },
    });

    if (shift.openingAmount > 0) {
      await this.movementRepository.create({
        shiftId: shift.id,
        proyectoId: shift.proyectoId,
        moduloId: shift.moduloId,
        createdByUserId: actor.userId,
        createdByUserName: actor.userName,
        type: "opening_fund",
        direction: "in",
        concept: "Fondo inicial de caja",
        amount: shift.openingAmount,
        createdAt: now,
        notes: input.notes?.trim() || undefined,
        metadata: {
          source: "shift_opening",
        },
      });
    }

    return this.getShiftDetail(shift.id, actor);
  }

  async getActiveShiftByModulo(
    moduloId: string,
    actor: CashRegisterActorContext,
  ) {
    const shift = await this.shiftRepository.findOpenByModuloId(moduloId);
    if (!shift) return null;

    this.ensureProjectAccess(shift.proyectoId, actor);
    return this.getShiftDetail(shift.id, actor);
  }

  async listShifts(
    filters: {
      moduloId?: string;
      status?: string;
      dateFrom?: number;
      dateTo?: number;
      page?: number;
      limit?: number;
    },
    actor: CashRegisterActorContext,
  ) {
    const result = await this.shiftRepository.getByFilters({
      ...filters,
      proyectoIds: actor.isSuperAdmin ? undefined : actor.allowedProjectIds,
    });

    return result;
  }

  async listShiftSummaries(
    filters: {
      moduloId?: string;
      status?: string;
      dateFrom?: number;
      dateTo?: number;
      page?: number;
      limit?: number;
    },
    actor: CashRegisterActorContext,
  ) {
    const result = await this.listShifts(filters, actor);
    const items = await Promise.all(
      result.items.map((shift) => this.getShiftDetail(shift.id, actor)),
    );

    return {
      total: result.total,
      items,
    };
  }

  async getShiftsSummary(
    filters: {
      moduloId?: string;
      status?: string;
      dateFrom?: number;
      dateTo?: number;
    },
    actor: CashRegisterActorContext,
  ) {
    const result = await this.listShiftSummaries(
      {
        ...filters,
        page: 1,
        limit: 100,
      },
      actor,
    );

    const totals = result.items.reduce(
      (summary, item) => {
        summary.totalShifts += 1;
        if (item.shift.status === "open") summary.openShifts += 1;
        if (item.shift.status === "closed") summary.closedShifts += 1;
        summary.openingAmount += item.summary.openingAmount;
        summary.totalIn += item.summary.totalIn;
        summary.totalOut += item.summary.totalOut;
        summary.expectedAmount += item.summary.expectedAmount;
        summary.countedAmount += item.summary.countedAmount ?? 0;
        summary.differenceAmount += item.summary.differenceAmount ?? 0;
        return summary;
      },
      {
        totalShifts: 0,
        openShifts: 0,
        closedShifts: 0,
        openingAmount: 0,
        totalIn: 0,
        totalOut: 0,
        expectedAmount: 0,
        countedAmount: 0,
        differenceAmount: 0,
      },
    );

    return Object.fromEntries(
      Object.entries(totals).map(([key, value]) => [
        key,
        Number(value.toFixed(2)),
      ]),
    );
  }

  async getShiftDetail(shiftId: string, actor: CashRegisterActorContext) {
    const shift = await this.getAccessibleShift(shiftId, actor);
    const [movements, counts, cut] = await Promise.all([
      this.movementRepository.getByShiftId(shift.id),
      this.countRepository.getByShiftId(shift.id),
      this.cutRepository.findByShiftId(shift.id),
    ]);

    const summary = this.buildShiftSummary(shift, movements, counts[0], cut);

    return {
      shift,
      summary,
      movements,
      counts,
      cut,
    };
  }

  async registerMovement(
    shiftId: string,
    input: RegisterMovementInput,
    actor: CashRegisterActorContext,
  ) {
    const shift = await this.getAccessibleShift(shiftId, actor);
    this.ensureShiftOpen(shift);
    this.ensureShiftOperator(shift, actor);

    const direction =
      input.direction ?? this.resolveDirectionFromType(input.type);

    const movement = await this.movementRepository.create({
      shiftId: shift.id,
      proyectoId: shift.proyectoId,
      moduloId: shift.moduloId,
      createdByUserId: actor.userId,
      createdByUserName: actor.userName,
      type: input.type,
      direction,
      concept: input.concept.trim(),
      amount: Number(input.amount),
      createdAt: Date.now(),
      notes: input.notes?.trim() || undefined,
      metadata: input.metadata,
    });

    return {
      movement,
      detail: await this.getShiftDetail(shift.id, actor),
    };
  }

  async saveCount(
    shiftId: string,
    input: SaveCountInput,
    actor: CashRegisterActorContext,
  ) {
    const shift = await this.getAccessibleShift(shiftId, actor);
    this.ensureShiftOpen(shift);
    this.ensureShiftOperator(shift, actor);

    const denominations = input.denominations
      .map((line) => this.normalizeCountLine(line))
      .filter((line) => line.quantity > 0);

    const totalAmount = denominations.reduce(
      (sum, line) => sum + line.subtotal,
      0,
    );

    const count = await this.countRepository.create({
      shiftId: shift.id,
      countedByUserId: actor.userId,
      countedByUserName: actor.userName,
      countedAt: Date.now(),
      denominations,
      totalAmount,
      notes: input.notes?.trim() || undefined,
    });

    return {
      count,
      preview: await this.getCutPreview(shift.id, actor),
    };
  }

  async getCutPreview(shiftId: string, actor: CashRegisterActorContext) {
    const shift = await this.getAccessibleShift(shiftId, actor);
    const [movements, latestCount] = await Promise.all([
      this.movementRepository.getByShiftId(shift.id),
      this.countRepository.getLatestByShiftId(shift.id),
    ]);

    return this.buildCutPreview(shift, movements, latestCount);
  }

  async closeShift(
    shiftId: string,
    input: SaveCountInput,
    actor: CashRegisterActorContext,
  ) {
    const shift = await this.getAccessibleShift(shiftId, actor);
    this.ensureShiftOpen(shift);

    const existingCut = await this.cutRepository.findByShiftId(shift.id);
    if (existingCut) {
      throw CustomError.badRequest("El turno ya fue cerrado");
    }

    const movements = await this.movementRepository.getByShiftId(shift.id);
    const totals = this.sumMovementTotals(movements);
    const expectedAmount = Number(
      (shift.openingAmount + totals.totalIn - totals.totalOut).toFixed(2),
    );
    const countedAmount = this.calculateCountTotal(input.denominations);
    const projectedDifference = Number((countedAmount - expectedAmount).toFixed(2));

    if (projectedDifference !== 0 && !input.notes?.trim()) {
      throw CustomError.badRequest(
        "Captura una nota explicando la diferencia antes de cerrar el turno",
      );
    }

    const { count, preview } = await this.saveCount(shift.id, input, actor);
    const generatedAt = Date.now();

    const cut = await this.cutRepository.create({
      shiftId: shift.id,
      generatedByUserId: actor.userId,
      generatedByUserName: actor.userName,
      generatedAt,
      openingAmount: preview.openingAmount,
      totalIn: preview.totalIn,
      totalOut: preview.totalOut,
      expectedAmount: preview.expectedAmount,
      countedAmount: preview.countedAmount,
      differenceAmount: preview.differenceAmount,
      status: preview.status,
      notes: input.notes?.trim() || undefined,
    });

    await this.shiftRepository.update(shift.id, {
      status: "closed",
      closedAt: generatedAt,
      closingAmountExpected: preview.expectedAmount,
      closingAmountCounted: preview.countedAmount,
      differenceAmount: preview.differenceAmount,
    });

    return {
      count,
      cut,
      detail: await this.getShiftDetail(shift.id, actor),
    };
  }

  async recordTicketPaymentFromCashSession(options: {
    shiftId: string;
    cashPaymentSessionId: string;
    ticketId: string;
    proyectoId: string;
    moduloId: string;
    paymentId: string;
    amountExpected: number;
    amountReceived: number;
    changeAmount: number;
    paidAt: number;
  }) {
    const existingMovement =
      await this.movementRepository.findByCashPaymentSessionId(
        options.cashPaymentSessionId,
      );

    if (existingMovement) {
      return existingMovement;
    }

    const shift = await this.shiftRepository.findById(options.shiftId);
    if (!shift) {
      throw CustomError.badRequest("El turno de caja asociado no existe");
    }

    this.ensureShiftOpen(shift);

    return this.movementRepository.create({
      shiftId: shift.id,
      proyectoId: options.proyectoId,
      moduloId: options.moduloId,
      createdByUserId: shift.openedByUserId,
      createdByUserName: shift.openedByUserName,
      type: "ticket_payment_income",
      direction: "in",
      concept: "Cobro de boleto en efectivo",
      amount: options.amountExpected,
      createdAt: options.paidAt,
      relatedTicketId: options.ticketId,
      relatedPaymentId: options.paymentId,
      relatedCashPaymentSessionId: options.cashPaymentSessionId,
      metadata: {
        amountReceived: options.amountReceived,
        changeAmount: options.changeAmount,
      },
    });
  }

  private async getAccessibleShift(
    shiftId: string,
    actor: CashRegisterActorContext,
  ) {
    const shift = await this.shiftRepository.findById(shiftId);
    if (!shift) {
      throw CustomError.notFound("Turno de caja no encontrado");
    }

    this.ensureProjectAccess(shift.proyectoId, actor);
    return shift;
  }

  private async resolveModulo(moduloId: string) {
    const modulo = await ModuloModel.findById(moduloId);

    if (!modulo) {
      throw CustomError.notFound("Caja no encontrada");
    }

    const moduloTipo = String(modulo.get("tipo") ?? "").trim().toUpperCase();
    if (moduloTipo !== "POS") {
      throw CustomError.badRequest("El modulo seleccionado no es una caja POS");
    }

    if (modulo.get("estado") === false) {
      throw CustomError.badRequest("La caja seleccionada esta inactiva");
    }

    return modulo;
  }

  private ensureProjectAccess(
    projectId: string,
    actor: CashRegisterActorContext,
  ) {
    if (actor.isSuperAdmin) return;

    if (!actor.allowedProjectIds.includes(projectId)) {
      throw CustomError.forbidden("No tienes acceso al proyecto solicitado");
    }
  }

  private ensureShiftOpen(shift: CashRegisterShiftEntity) {
    if (shift.status !== "open") {
      throw CustomError.badRequest("El turno de caja ya no esta abierto");
    }
  }

  private ensureShiftOperator(
    shift: CashRegisterShiftEntity,
    actor: CashRegisterActorContext,
  ) {
    if (actor.isSuperAdmin) return;

    if (shift.openedByUserId !== actor.userId) {
      throw CustomError.forbidden(
        "Solo el usuario que abrio el turno puede operar esta caja",
      );
    }
  }

  private resolveDirectionFromType(type: CashRegisterMovementType) {
    switch (type) {
      case "manual_expense":
      case "cash_withdrawal":
      case "refund":
        return "out";
      default:
        return "in";
    }
  }

  private normalizeCountLine(line: {
    label: string;
    value: number;
    quantity: number;
  }): CashRegisterCountLine {
    const label = String(line.label ?? "").trim();
    const value = Number(line.value ?? 0);
    const quantity = Number(line.quantity ?? 0);

    if (!label) {
      throw CustomError.badRequest("Cada denominacion debe tener etiqueta");
    }

    if (!Number.isFinite(value) || value < 0) {
      throw CustomError.badRequest("El valor de la denominacion no es valido");
    }

    if (!Number.isFinite(quantity) || quantity < 0) {
      throw CustomError.badRequest("La cantidad de la denominacion no es valida");
    }

    return {
      label,
      value,
      quantity,
      subtotal: Number((value * quantity).toFixed(2)),
    };
  }

  private calculateCountTotal(
    lines: Array<{
      value: number;
      quantity: number;
    }>,
  ) {
    return Number(
      lines
        .reduce((sum, line) => {
          const value = Number(line.value ?? 0);
          const quantity = Number(line.quantity ?? 0);
          return sum + value * quantity;
        }, 0)
        .toFixed(2),
    );
  }

  private buildShiftSummary(
    shift: CashRegisterShiftEntity,
    movements: CashRegisterMovementEntity[],
    latestCount: CashRegisterCountEntity | null | undefined,
    cut: CashRegisterCutEntity | null,
  ) {
    const totals = this.sumMovementTotals(movements);
    const expectedAmount = Number(
      (shift.openingAmount + totals.totalIn - totals.totalOut).toFixed(2),
    );

    return {
      openingAmount: shift.openingAmount,
      totalIn: totals.totalIn,
      totalOut: totals.totalOut,
      expectedAmount,
      countedAmount: latestCount?.totalAmount ?? null,
      differenceAmount: latestCount
        ? Number((latestCount.totalAmount - expectedAmount).toFixed(2))
        : null,
      hasCut: Boolean(cut),
      cutStatus: cut?.status ?? null,
    };
  }

  private buildCutPreview(
    shift: CashRegisterShiftEntity,
    movements: CashRegisterMovementEntity[],
    latestCount: CashRegisterCountEntity | null,
  ): {
    openingAmount: number;
    totalIn: number;
    totalOut: number;
    expectedAmount: number;
    countedAmount: number;
    differenceAmount: number;
    status: CashRegisterCutStatus;
  } {
    if (!latestCount) {
      throw CustomError.badRequest(
        "Debes registrar un conteo antes de generar el corte",
      );
    }

    const totals = this.sumMovementTotals(movements);
    const expectedAmount = Number(
      (shift.openingAmount + totals.totalIn - totals.totalOut).toFixed(2),
    );
    const countedAmount = Number(latestCount.totalAmount.toFixed(2));
    const differenceAmount = Number((countedAmount - expectedAmount).toFixed(2));

    let status: CashRegisterCutStatus = "balanced";
    if (differenceAmount < 0) status = "short";
    if (differenceAmount > 0) status = "over";

    return {
      openingAmount: shift.openingAmount,
      totalIn: totals.totalIn,
      totalOut: totals.totalOut,
      expectedAmount,
      countedAmount,
      differenceAmount,
      status,
    };
  }

  private sumMovementTotals(movements: CashRegisterMovementEntity[]) {
    const totalIn = Number(
      movements
        .filter(
          (movement) =>
            movement.direction === "in" && movement.type !== "opening_fund",
        )
        .reduce((sum, movement) => sum + movement.amount, 0)
        .toFixed(2),
    );

    const totalOut = Number(
      movements
        .filter((movement) => movement.direction === "out")
        .reduce((sum, movement) => sum + movement.amount, 0)
        .toFixed(2),
    );

    return { totalIn, totalOut };
  }
}
