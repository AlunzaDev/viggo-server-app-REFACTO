import { TicketEntity } from "../../entities/parking/ticket.entity";

export abstract class TicketRepository {
    abstract create(ticket: Omit<TicketEntity, "id">): Promise<TicketEntity>;
    abstract findById(id: string): Promise<TicketEntity | null>;
    abstract findByIdBoleto(idBoleto: string): Promise<TicketEntity | null>;
    abstract getAll(): Promise<TicketEntity[]>;
    abstract getByUsuario(usuarioId: string): Promise<TicketEntity[]>;
    abstract getActiveByUsuario(usuarioId: string): Promise<TicketEntity | null>;
    abstract update(
        id: string,
        ticket: Partial<Omit<TicketEntity, "id">>,
    ): Promise<TicketEntity | null>;
    abstract delete(id: string): Promise<TicketEntity | null>;
}