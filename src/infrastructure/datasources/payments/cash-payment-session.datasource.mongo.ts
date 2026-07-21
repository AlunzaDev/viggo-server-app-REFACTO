import { CashPaymentSessionModel } from "../../../data/mongo/models/payments/cash-payment-session.schema";
import { CashPaymentSessionDatasource } from "../../../domain/datasources/payments/cash-payment-session.datasource";
import { CashPaymentSessionEntity } from "../../../domain/entities/payments/cash-payment-session.entity";

const ACTIVE_CASH_SESSION_STATUSES: CashPaymentSessionEntity["status"][] = [
  "created",
  "pending_cash",
  "partially_paid",
];

export class CashPaymentSessionMongoDatasource extends CashPaymentSessionDatasource {
  async create(
    session: Omit<CashPaymentSessionEntity, "id">,
  ): Promise<CashPaymentSessionEntity> {
    const sessionDocument = await CashPaymentSessionModel.create(session);
    return CashPaymentSessionEntity.fromObject(sessionDocument.toObject());
  }

  async findById(id: string): Promise<CashPaymentSessionEntity | null> {
    const sessionDocument = await CashPaymentSessionModel.findById(id);
    if (!sessionDocument) return null;

    return CashPaymentSessionEntity.fromObject(sessionDocument.toObject());
  }

  async findActiveByTicketId(
    ticketId: string,
  ): Promise<CashPaymentSessionEntity | null> {
    const sessionDocument = await CashPaymentSessionModel.findOne({
      ticketId,
      status: { $in: ACTIVE_CASH_SESSION_STATUSES },
    }).sort({ startedAt: -1 });

    if (!sessionDocument) return null;

    return CashPaymentSessionEntity.fromObject(sessionDocument.toObject());
  }

  async findActiveByIdBoleto(
    idBoleto: string,
  ): Promise<CashPaymentSessionEntity | null> {
    const sessionDocument = await CashPaymentSessionModel.findOne({
      idBoleto,
      status: { $in: ACTIVE_CASH_SESSION_STATUSES },
    }).sort({ startedAt: -1 });

    if (!sessionDocument) return null;

    return CashPaymentSessionEntity.fromObject(sessionDocument.toObject());
  }

  async update(
    id: string,
    session: Partial<Omit<CashPaymentSessionEntity, "id">>,
  ): Promise<CashPaymentSessionEntity | null> {
    const sessionDocument = await CashPaymentSessionModel.findByIdAndUpdate(
      id,
      session,
      { new: true },
    );

    if (!sessionDocument) return null;

    return CashPaymentSessionEntity.fromObject(sessionDocument.toObject());
  }

  async appendEvent(
    id: string,
    event: CashPaymentSessionEntity["events"][number],
  ): Promise<CashPaymentSessionEntity | null> {
    const sessionDocument = await CashPaymentSessionModel.findByIdAndUpdate(
      id,
      {
        $push: { events: event },
      },
      { new: true },
    );

    if (!sessionDocument) return null;

    return CashPaymentSessionEntity.fromObject(sessionDocument.toObject());
  }
}
