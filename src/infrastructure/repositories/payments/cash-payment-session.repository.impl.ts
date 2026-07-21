import { CashPaymentSessionDatasource } from "../../../domain/datasources/payments/cash-payment-session.datasource";
import { CashPaymentSessionEntity } from "../../../domain/entities/payments/cash-payment-session.entity";
import { CashPaymentSessionRepository } from "../../../domain/repository/payments/cash-payment-session.repository";

export class CashPaymentSessionRepositoryImpl extends CashPaymentSessionRepository {
  constructor(
    private readonly cashPaymentSessionDatasource: CashPaymentSessionDatasource,
  ) {
    super();
  }

  create(
    session: Omit<CashPaymentSessionEntity, "id">,
  ): Promise<CashPaymentSessionEntity> {
    return this.cashPaymentSessionDatasource.create(session);
  }

  findById(id: string): Promise<CashPaymentSessionEntity | null> {
    return this.cashPaymentSessionDatasource.findById(id);
  }

  findActiveByTicketId(
    ticketId: string,
  ): Promise<CashPaymentSessionEntity | null> {
    return this.cashPaymentSessionDatasource.findActiveByTicketId(ticketId);
  }

  findActiveByIdBoleto(
    idBoleto: string,
  ): Promise<CashPaymentSessionEntity | null> {
    return this.cashPaymentSessionDatasource.findActiveByIdBoleto(idBoleto);
  }

  update(
    id: string,
    session: Partial<Omit<CashPaymentSessionEntity, "id">>,
  ): Promise<CashPaymentSessionEntity | null> {
    return this.cashPaymentSessionDatasource.update(id, session);
  }

  appendEvent(
    id: string,
    event: CashPaymentSessionEntity["events"][number],
  ): Promise<CashPaymentSessionEntity | null> {
    return this.cashPaymentSessionDatasource.appendEvent(id, event);
  }
}
