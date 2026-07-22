import { envs } from "../../../config";
import { CashRegisterMovementModel } from "../../../data/mongo/models/cash-register/cash-register-movement.schema";
import { CashRegisterShiftModel } from "../../../data/mongo/models/cash-register/cash-register-shift.schema";
import { ModuloModel } from "../../../data/mongo/models/parking/modulo.schema";
import { ProyectoModel } from "../../../data/mongo/models/parking/proyecto.schema";
import { TicketModel } from "../../../data/mongo/models/parking/ticket.schema";
import { CashPaymentSessionModel } from "../../../data/mongo/models/payments/cash-payment-session.schema";
import { PaymentModel } from "../../../data/mongo/models/payments/payment.schema";
import { startSession as startMongoSession } from "mongoose";
import { CashPaymentSessionEntity } from "../../../domain/entities/payments/cash-payment-session.entity";
import { CustomError } from "../../../domain/errors/custom.error";
import { CashRegisterShiftRepository } from "../../../domain/repository/cash-register/cash-register-shift.repository";
import { TicketRepository } from "../../../domain/repository/parking/ticket.repository";
import { CashPaymentSessionRepository } from "../../../domain/repository/payments/cash-payment-session.repository";
import { PaymentRepository } from "../../../domain/repository/payments/payment.repository";
import { CashRegisterService } from "../cash-register/cash-register.service";

export interface CashPaymentActorContext {
  userId: string;
  userName?: string;
  allowedProjectIds: string[];
  isSuperAdmin: boolean;
}

export class CashTicketPaymentService {
  constructor(
    private readonly ticketRepository: TicketRepository,
    private readonly cashPaymentSessionRepository: CashPaymentSessionRepository,
    private readonly paymentRepository: PaymentRepository,
    private readonly cashRegisterShiftRepository: CashRegisterShiftRepository,
    private readonly cashRegisterService: CashRegisterService,
  ) {}

  async resolveTicketFromQr(qrValue: string, allowedProjectIds: string[] = []) {
    const normalizedQrValue = String(qrValue ?? "").trim();

    if (!normalizedQrValue) {
      throw CustomError.badRequest("El QR del boleto es obligatorio");
    }

    const ticket =
      (await this.ticketRepository.findByIdBoleto(normalizedQrValue)) ||
      (await this.ticketRepository.findById(normalizedQrValue));

    if (!ticket) {
      throw CustomError.notFound("Ticket no encontrado");
    }

    this.ensureProjectAccess(ticket.proyecto, allowedProjectIds);

    if (ticket.pagado) {
      throw CustomError.badRequest("El ticket ya fue pagado");
    }

    let currentTicket = ticket;

    if (ticket.horaConsulta <= 0 || ticket.monto <= 0) {
      const now = Date.now();
      const duration = Math.round((now - ticket.horaInicio) / 1000 / 60);
      const amount = duration < 60 ? 10 : 20;

      const updatedTicket = await this.ticketRepository.update(ticket.id, {
        horaConsulta: now,
        duracion: duration,
        monto: amount,
      });

      if (!updatedTicket) {
        throw CustomError.notFound("Ticket no encontrado");
      }

      currentTicket = updatedTicket;
    }

    const activeSession =
      await this.cashPaymentSessionRepository.findActiveByTicketId(
        currentTicket.id,
      );

    return {
      ticket: currentTicket,
      hasActiveSession: Boolean(activeSession),
      activeSession,
    };
  }

  async startCashSession(
    ticketId: string,
    moduloId: string,
    actor: CashPaymentActorContext,
  ) {
    const ticket = await this.ticketRepository.findById(ticketId);

    if (!ticket) {
      throw CustomError.notFound("Ticket no encontrado");
    }

    this.ensureProjectAccess(ticket.proyecto, actor.allowedProjectIds);

    if (ticket.pagado) {
      throw CustomError.badRequest("El ticket ya fue pagado");
    }

    if (ticket.monto <= 0) {
      throw CustomError.badRequest("El ticket no tiene monto por cobrar");
    }

    const modulo = await ModuloModel.findById(moduloId);
    if (!modulo) {
      throw CustomError.notFound("Caja no encontrada");
    }

    const moduloProjectId = String(modulo.get("proyecto") ?? "");
    if (!moduloProjectId || moduloProjectId !== ticket.proyecto) {
      throw CustomError.badRequest(
        "La caja seleccionada no pertenece al proyecto del ticket",
      );
    }

    const moduloTipo = String(modulo.get("tipo") ?? "").trim().toUpperCase();
    if (moduloTipo !== "POS") {
      throw CustomError.badRequest("El modulo seleccionado no es un POS");
    }

    if (modulo.get("estado") === false) {
      throw CustomError.badRequest("La caja seleccionada esta inactiva");
    }

    const existingSession =
      await this.cashPaymentSessionRepository.findActiveByTicketId(ticket.id);

    if (existingSession) {
      return existingSession;
    }

    const activeShift =
      await this.cashRegisterShiftRepository.findOpenByModuloId(String(modulo._id));

    if (!activeShift) {
      throw CustomError.badRequest(
        "La caja seleccionada no tiene un turno abierto",
      );
    }

    this.ensureShiftOperator(activeShift.openedByUserId, actor);

    return this.cashPaymentSessionRepository.create({
      ticketId: ticket.id,
      idBoleto: ticket.idBoleto,
      status: "pending_cash",
      amountExpected: ticket.monto,
      amountReceived: 0,
      changeAmount: 0,
      moduloId: String(modulo._id),
      moduloIdentificador: String(modulo.get("identificador") ?? "").trim() || undefined,
      moduloNombre: String(modulo.get("nombre") ?? "").trim() || undefined,
      deviceId: String(modulo.get("identificador") ?? "").trim() || undefined,
      cashRegisterShiftId: activeShift.id,
      startedAt: Date.now(),
      completedAt: undefined,
      cancelledAt: undefined,
      events: [
        {
          type: "session_created",
          createdAt: Date.now(),
          payload: {
            ticketId: ticket.id,
            idBoleto: ticket.idBoleto,
            moduloId: String(modulo._id),
            moduloIdentificador:
              String(modulo.get("identificador") ?? "").trim() || undefined,
            moduloNombre: String(modulo.get("nombre") ?? "").trim() || undefined,
            deviceId:
              String(modulo.get("identificador") ?? "").trim() || undefined,
            cashRegisterShiftId: activeShift.id,
          },
        },
      ],
    });
  }

  async registerCashInsertion(
    sessionId: string,
    amount: number,
    actor: CashPaymentActorContext,
    rawEvent?: Record<string, unknown>,
  ) {
    const session = await this.cashPaymentSessionRepository.findById(sessionId);

    if (!session) {
      throw CustomError.notFound("Sesion de cobro no encontrada");
    }

    const ticket = await this.ticketRepository.findById(session.ticketId);
    if (!ticket) {
      throw CustomError.notFound("Ticket no encontrado");
    }

    this.ensureProjectAccess(ticket.proyecto, actor.allowedProjectIds);

    if (!this.isSessionActive(session.status)) {
      throw CustomError.badRequest("La sesion ya no esta activa");
    }

    const idempotencyKey =
      typeof rawEvent?.idempotencyKey === "string"
        ? rawEvent.idempotencyKey.trim()
        : "";
    const duplicateEvent = idempotencyKey
      ? session.events.find((event) => {
          const payload = event.payload ?? {};
          return (
            event.type === "cash_inserted" &&
            typeof payload.idempotencyKey === "string" &&
            payload.idempotencyKey === idempotencyKey
          );
        })
      : undefined;

    if (duplicateEvent) {
      return session;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      throw CustomError.badRequest("El monto registrado en POS no es valido");
    }

    if (session.cashRegisterShiftId) {
      const activeShift = await this.cashRegisterShiftRepository.findById(
        session.cashRegisterShiftId,
      );
      if (!activeShift) {
        throw CustomError.badRequest("El turno de caja asociado no existe");
      }
      this.ensureShiftOperator(activeShift.openedByUserId, actor);
    }

    return this.commitCashInsertionTransaction({
      session,
      amount,
      rawEvent,
      actor,
    });
  }

  async cancelSession(
    sessionId: string,
    actor: CashPaymentActorContext,
    cancellationReason?: string,
  ) {
    const session = await this.cashPaymentSessionRepository.findById(sessionId);

    if (!session) {
      throw CustomError.notFound("Sesion de cobro no encontrada");
    }

    const ticket = await this.ticketRepository.findById(session.ticketId);
    if (!ticket) {
      throw CustomError.notFound("Ticket no encontrado");
    }

    this.ensureProjectAccess(ticket.proyecto, actor.allowedProjectIds);

    if (session.cashRegisterShiftId) {
      const activeShift = await this.cashRegisterShiftRepository.findById(
        session.cashRegisterShiftId,
      );
      if (activeShift) {
        this.ensureShiftOperator(activeShift.openedByUserId, actor);
      }
    }

    if (!this.isSessionActive(session.status)) {
      return session;
    }

    const reason = String(cancellationReason ?? "").trim();
    if (session.amountReceived > 0 && reason.length < 5) {
      throw CustomError.badRequest(
        "Captura un motivo de cancelacion cuando el cobro ya tiene efectivo registrado",
      );
    }

    const cancelledAt = Date.now();

    const updatedSession = await this.cashPaymentSessionRepository.update(
      session.id,
      {
        status: "cancelled",
        cancelledAt,
      },
    );

    if (!updatedSession) {
      throw CustomError.notFound("Sesion de cobro no encontrada");
    }

    await this.cashPaymentSessionRepository.appendEvent(updatedSession.id, {
      type: "session_cancelled",
      createdAt: cancelledAt,
      payload: {
        amountReceived: updatedSession.amountReceived,
        reason: reason || undefined,
        cancelledByUserId: actor.userId,
        cancelledByUserName: actor.userName,
      },
    });

    const finalSession = await this.cashPaymentSessionRepository.findById(
      updatedSession.id,
    );

    if (!finalSession) {
      throw CustomError.notFound("Sesion de cobro no encontrada");
    }

    return finalSession;
  }

  async getSessionById(sessionId: string, allowedProjectIds: string[] = []) {
    const session = await this.cashPaymentSessionRepository.findById(sessionId);

    if (!session) {
      throw CustomError.notFound("Sesion de cobro no encontrada");
    }

    const ticket = await this.ticketRepository.findById(session.ticketId);
    if (!ticket) {
      throw CustomError.notFound("Ticket no encontrado");
    }

    this.ensureProjectAccess(ticket.proyecto, allowedProjectIds);

    return session;
  }

  private isSessionActive(status: string) {
    return (
      status === "created" ||
      status === "pending_cash" ||
      status === "partially_paid"
    );
  }

  private ensureProjectAccess(projectId: string, allowedProjectIds: string[]) {
    if (allowedProjectIds.length === 0) return;

    if (!allowedProjectIds.includes(projectId)) {
      throw CustomError.forbidden(
        "El ticket pertenece a otro proyecto y no puedes cobrarlo con este acceso",
      );
    }
  }

  private ensureShiftOperator(openedByUserId: string, actor: CashPaymentActorContext) {
    if (actor.isSuperAdmin) return;

    if (openedByUserId !== actor.userId) {
      throw CustomError.forbidden(
        "Solo el usuario que abrio el turno puede operar esta caja",
      );
    }
  }

  private async commitCashInsertionTransaction(options: {
    session: CashPaymentSessionEntity;
    amount: number;
    rawEvent?: Record<string, unknown>;
    actor: CashPaymentActorContext;
  }) {
    const mongoSession = await startMongoSession();
    let finalSession: CashPaymentSessionEntity | null = null;

    try {
      await mongoSession.withTransaction(async () => {
        const sessionDocument = await CashPaymentSessionModel.findById(
          options.session.id,
        ).session(mongoSession);

        if (!sessionDocument) {
          throw CustomError.notFound("Sesion de cobro no encontrada");
        }

        const currentSession = CashPaymentSessionEntity.fromObject(
          sessionDocument.toObject(),
        );

        if (!this.isSessionActive(currentSession.status)) {
          throw CustomError.badRequest("La sesion ya no esta activa");
        }

        const idempotencyKey =
          typeof options.rawEvent?.idempotencyKey === "string"
            ? options.rawEvent.idempotencyKey.trim()
            : "";
        const duplicateEvent = idempotencyKey
          ? currentSession.events.find((event) => {
              const payload = event.payload ?? {};
              return (
                event.type === "cash_inserted" &&
                typeof payload.idempotencyKey === "string" &&
                payload.idempotencyKey === idempotencyKey
              );
            })
          : undefined;

        if (duplicateEvent) {
          finalSession = currentSession;
          return;
        }

        const ticketDocument = await TicketModel.findById(
          currentSession.ticketId,
        ).session(mongoSession);

        if (!ticketDocument) {
          throw CustomError.notFound("Ticket no encontrado");
        }

        if (ticketDocument.get("pagado") === true) {
          throw CustomError.badRequest("El ticket ya fue pagado");
        }

        const shiftDocument = currentSession.cashRegisterShiftId
          ? await CashRegisterShiftModel.findById(
              currentSession.cashRegisterShiftId,
            ).session(mongoSession)
          : null;

        if (currentSession.cashRegisterShiftId && !shiftDocument) {
          throw CustomError.badRequest("El turno de caja asociado no existe");
        }

        if (shiftDocument) {
          if (String(shiftDocument.get("status")) !== "open") {
            throw CustomError.badRequest("El turno de caja ya no esta abierto");
          }
          this.ensureShiftOperator(
            String(shiftDocument.get("openedByUserId") ?? ""),
            options.actor,
          );
        }

        const now = Date.now();
        const nextAmountReceived = currentSession.amountReceived + options.amount;
        const nextChange =
          nextAmountReceived > currentSession.amountExpected
            ? nextAmountReceived - currentSession.amountExpected
            : 0;
        const nextStatus =
          nextAmountReceived >= currentSession.amountExpected
            ? "paid"
            : "partially_paid";

        const events: CashPaymentSessionEntity["events"] = [
          {
            type: "cash_inserted",
            amount: options.amount,
            payload: options.rawEvent,
            createdAt: now,
          },
        ];

        if (nextStatus === "paid") {
          events.push(
            {
              type: "change_calculated",
              amount: nextChange,
              createdAt: now,
              payload: {
                amountExpected: currentSession.amountExpected,
                amountReceived: nextAmountReceived,
              },
            },
            {
              type: "session_completed",
              createdAt: now,
              payload: {
                ticketId: currentSession.ticketId,
                paidAt: now,
                completedByUserId: options.actor.userId,
                completedByUserName: options.actor.userName,
              },
            },
          );
        }

        const updatedSessionDocument =
          await CashPaymentSessionModel.findByIdAndUpdate(
            currentSession.id,
            {
              $set: {
                amountReceived: nextAmountReceived,
                changeAmount: nextChange,
                status: nextStatus,
                completedAt: nextStatus === "paid" ? now : undefined,
              },
              $push: {
                events: {
                  $each: events,
                },
              },
            },
            { new: true, session: mongoSession },
          );

        if (!updatedSessionDocument) {
          throw CustomError.notFound("Sesion de cobro no encontrada");
        }

        if (nextStatus !== "paid") {
          finalSession = CashPaymentSessionEntity.fromObject(
            updatedSessionDocument.toObject(),
          );
          return;
        }

        await TicketModel.findByIdAndUpdate(
          currentSession.ticketId,
          {
            pagado: true,
            horaCobro: now,
          },
          { session: mongoSession },
        );

        const providerReference = `pos_session_${currentSession.id}`;
        let paymentDocument = await PaymentModel.findOne({
          stripePaymentIntentId: providerReference,
        }).session(mongoSession);

        if (!paymentDocument) {
          const projectDocument = await ProyectoModel.findById(
            ticketDocument.get("proyecto"),
          ).session(mongoSession);

          [paymentDocument] = await PaymentModel.create(
            [
              {
                user: ticketDocument.get("usuario"),
                type: "ticket",
                concept: "Pago de ticket en POS",
                amount: Number(ticketDocument.get("monto") ?? 0),
                currency: envs.STRIPE_CURRENCY.toUpperCase(),
                status: "succeeded",
                paidAt: now,
                stripePaymentIntentId: providerReference,
                paymentMethod: undefined,
                reference: {
                  type: "ticket",
                  id: currentSession.ticketId,
                },
                parking: projectDocument
                  ? {
                      id: String(projectDocument._id),
                      name: String(projectDocument.get("nombre") ?? ""),
                      city: String(projectDocument.get("ciudad") ?? ""),
                    }
                  : undefined,
                rawProviderStatus: "pos_succeeded",
              },
            ],
            { session: mongoSession },
          );
        }

        if (currentSession.cashRegisterShiftId && shiftDocument) {
          const existingMovement = await CashRegisterMovementModel.findOne({
            relatedCashPaymentSessionId: currentSession.id,
          }).session(mongoSession);

          if (!existingMovement) {
            await CashRegisterMovementModel.create(
              [
                {
                  shiftId: currentSession.cashRegisterShiftId,
                  proyectoId: String(ticketDocument.get("proyecto") ?? ""),
                  moduloId: currentSession.moduloId,
                  createdByUserId: options.actor.userId,
                  createdByUserName:
                    options.actor.userName ||
                    String(shiftDocument.get("openedByUserName") ?? "") ||
                    undefined,
                  type: "ticket_payment_income",
                  direction: "in",
                  concept: "Cobro de boleto en efectivo",
                  amount: currentSession.amountExpected,
                  createdAt: now,
                  relatedTicketId: currentSession.ticketId,
                  relatedPaymentId: String(paymentDocument._id),
                  relatedCashPaymentSessionId: currentSession.id,
                  metadata: {
                    amountReceived: nextAmountReceived,
                    changeAmount: nextChange,
                    source: "cash_payment_transaction",
                  },
                },
              ],
              { session: mongoSession },
            );
          }
        }

        finalSession = CashPaymentSessionEntity.fromObject(
          updatedSessionDocument.toObject(),
        );
      });
    } catch (error) {
      if (this.isMongoTransactionUnsupported(error)) {
        throw CustomError.internalServer(
          "MongoDB debe correr como replica set o Atlas para confirmar cobros POS con transacciones",
          undefined,
          "MONGO_TRANSACTIONS_REQUIRED",
        );
      }

      throw error;
    } finally {
      await mongoSession.endSession();
    }

    if (!finalSession) {
      throw CustomError.notFound("Sesion de cobro no encontrada");
    }

    return finalSession;
  }

  private isMongoTransactionUnsupported(error: unknown) {
    if (!error || typeof error !== "object") return false;
    const message = String((error as { message?: unknown }).message ?? "");

    return (
      message.includes("Transaction numbers are only allowed") ||
      message.includes("replica set member or mongos") ||
      message.includes("Transaction") && message.includes("not supported")
    );
  }
}
