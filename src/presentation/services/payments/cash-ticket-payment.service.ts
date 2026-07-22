import { envs } from "../../../config";
import { ModuloModel } from "../../../data/mongo/models/parking/modulo.schema";
import { ProyectoModel } from "../../../data/mongo/models/parking/proyecto.schema";
import { CustomError } from "../../../domain/errors/custom.error";
import { CashRegisterShiftRepository } from "../../../domain/repository/cash-register/cash-register-shift.repository";
import { TicketRepository } from "../../../domain/repository/parking/ticket.repository";
import { CashPaymentSessionRepository } from "../../../domain/repository/payments/cash-payment-session.repository";
import { PaymentRepository } from "../../../domain/repository/payments/payment.repository";
import { CashRegisterService } from "../cash-register/cash-register.service";

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
    allowedProjectIds: string[] = [],
  ) {
    const ticket = await this.ticketRepository.findById(ticketId);

    if (!ticket) {
      throw CustomError.notFound("Ticket no encontrado");
    }

    this.ensureProjectAccess(ticket.proyecto, allowedProjectIds);

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
    rawEvent?: Record<string, unknown>,
    allowedProjectIds: string[] = [],
  ) {
    const session = await this.cashPaymentSessionRepository.findById(sessionId);

    if (!session) {
      throw CustomError.notFound("Sesion de cobro no encontrada");
    }

    const ticket = await this.ticketRepository.findById(session.ticketId);
    if (!ticket) {
      throw CustomError.notFound("Ticket no encontrado");
    }

    this.ensureProjectAccess(ticket.proyecto, allowedProjectIds);

    if (!this.isSessionActive(session.status)) {
      throw CustomError.badRequest("La sesion ya no esta activa");
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      throw CustomError.badRequest("El monto registrado en POS no es valido");
    }

    const now = Date.now();
    const nextAmountReceived = session.amountReceived + amount;
    const nextChange =
      nextAmountReceived > session.amountExpected
        ? nextAmountReceived - session.amountExpected
        : 0;

    const nextStatus =
      nextAmountReceived >= session.amountExpected ? "paid" : "partially_paid";

    const updatedSession = await this.cashPaymentSessionRepository.update(
      session.id,
      {
        amountReceived: nextAmountReceived,
        changeAmount: nextChange,
        status: nextStatus,
        completedAt: nextStatus === "paid" ? now : undefined,
      },
    );

    if (!updatedSession) {
      throw CustomError.notFound("Sesion de cobro no encontrada");
    }

    const sessionWithInsertEvent =
      await this.cashPaymentSessionRepository.appendEvent(updatedSession.id, {
        type: "cash_inserted",
        amount,
        payload: rawEvent,
        createdAt: now,
      });

    if (!sessionWithInsertEvent) {
      throw CustomError.notFound("Sesion de cobro no encontrada");
    }

    if (nextStatus !== "paid") {
      return sessionWithInsertEvent;
    }

    await this.cashPaymentSessionRepository.appendEvent(
      sessionWithInsertEvent.id,
      {
        type: "change_calculated",
        amount: nextChange,
        createdAt: Date.now(),
        payload: {
          amountExpected: session.amountExpected,
          amountReceived: nextAmountReceived,
        },
      },
    );

    const paidAt = Date.now();

    const ticketUpdated = await this.ticketRepository.update(session.ticketId, {
      pagado: true,
      horaCobro: paidAt,
    });

    if (!ticketUpdated) {
      throw CustomError.notFound("Ticket no encontrado");
    }

    const payment = await this.recordCashTicketPayment({
      ticketId: ticketUpdated.id,
      userId: ticketUpdated.usuario,
      projectId: ticketUpdated.proyecto,
      amount: ticketUpdated.monto,
      paidAt: ticketUpdated.horaCobro,
      sessionId: sessionWithInsertEvent.id,
    });

    if (session.cashRegisterShiftId) {
      await this.cashRegisterService.recordTicketPaymentFromCashSession({
        shiftId: session.cashRegisterShiftId,
        cashPaymentSessionId: sessionWithInsertEvent.id,
        ticketId: ticketUpdated.id,
        proyectoId: ticketUpdated.proyecto,
        moduloId: session.moduloId,
        paymentId: payment.id,
        amountExpected: session.amountExpected,
        amountReceived: nextAmountReceived,
        changeAmount: nextChange,
        paidAt: ticketUpdated.horaCobro,
      });
    }

    await this.cashPaymentSessionRepository.appendEvent(
      sessionWithInsertEvent.id,
      {
        type: "session_completed",
        createdAt: Date.now(),
        payload: {
          ticketId: ticketUpdated.id,
          paidAt: ticketUpdated.horaCobro,
        },
      },
    );

    const finalSession = await this.cashPaymentSessionRepository.findById(
      sessionWithInsertEvent.id,
    );

    if (!finalSession) {
      throw CustomError.notFound("Sesion de cobro no encontrada");
    }

    return finalSession;
  }

  async cancelSession(sessionId: string, allowedProjectIds: string[] = []) {
    const session = await this.cashPaymentSessionRepository.findById(sessionId);

    if (!session) {
      throw CustomError.notFound("Sesion de cobro no encontrada");
    }

    const ticket = await this.ticketRepository.findById(session.ticketId);
    if (!ticket) {
      throw CustomError.notFound("Ticket no encontrado");
    }

    this.ensureProjectAccess(ticket.proyecto, allowedProjectIds);

    if (!this.isSessionActive(session.status)) {
      return session;
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

  private async recordCashTicketPayment(options: {
    ticketId: string;
    userId: string;
    projectId: string;
    amount: number;
    paidAt: number;
    sessionId: string;
  }) {
    const providerReference = `pos_session_${options.sessionId}`;

    const existingPayment =
      await this.paymentRepository.findByStripePaymentIntentId(
        providerReference,
      );

    if (existingPayment) {
      return existingPayment;
    }

    const project = await ProyectoModel.findById(options.projectId);

    return this.paymentRepository.create({
      user: options.userId,
      type: "ticket",
      concept: "Pago de ticket en POS",
      amount: options.amount,
      currency: envs.STRIPE_CURRENCY.toUpperCase(),
      status: "succeeded",
      paidAt: options.paidAt,
      stripePaymentIntentId: providerReference,
      paymentMethod: undefined,
      reference: {
        type: "ticket",
        id: options.ticketId,
      },
      parking: project
        ? {
            id: String(project._id),
            name: String(project.get("nombre") ?? ""),
            city: String(project.get("ciudad") ?? ""),
          }
        : undefined,
      rawProviderStatus: "pos_succeeded",
    });
  }
}
