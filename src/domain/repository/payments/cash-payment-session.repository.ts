import { CashPaymentSessionEntity } from "../../entities/payments/cash-payment-session.entity";

export abstract class CashPaymentSessionRepository {
  abstract create(
    session: Omit<CashPaymentSessionEntity, "id">,
  ): Promise<CashPaymentSessionEntity>;

  abstract findById(id: string): Promise<CashPaymentSessionEntity | null>;

  abstract findActiveByTicketId(
    ticketId: string,
  ): Promise<CashPaymentSessionEntity | null>;

  abstract findActiveByIdBoleto(
    idBoleto: string,
  ): Promise<CashPaymentSessionEntity | null>;

  abstract update(
    id: string,
    session: Partial<Omit<CashPaymentSessionEntity, "id">>,
  ): Promise<CashPaymentSessionEntity | null>;

  abstract appendEvent(
    id: string,
    event: CashPaymentSessionEntity["events"][number],
  ): Promise<CashPaymentSessionEntity | null>;
}
