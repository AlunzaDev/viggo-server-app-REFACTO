import { TicketDatasource } from "../../../domain/datasources/parking/ticket.datasource";
import { TicketEntity } from "../../../domain/entities/parking/ticket.entity";
import { TicketRepository } from "../../../domain/repository/parking/ticket.repository";

export class TicketRepositoryImpl implements TicketRepository {
    constructor(private readonly ticketDatasource: TicketDatasource) {}

    create(ticket: Omit<TicketEntity, "id">): Promise<TicketEntity> {
        return this.ticketDatasource.create(ticket);
    }

    findById(id: string): Promise<TicketEntity | null> {
        return this.ticketDatasource.findById(id);
    }

    findByIdBoleto(idBoleto: string): Promise<TicketEntity | null> {
        return this.ticketDatasource.findByIdBoleto(idBoleto);
    }

    getAll(): Promise<TicketEntity[]> {
        return this.ticketDatasource.getAll();
    }

    getByUsuario(usuarioId: string): Promise<TicketEntity[]> {
        return this.ticketDatasource.getByUsuario(usuarioId);
    }

    getActiveByUsuario(usuarioId: string): Promise<TicketEntity | null> {
        return this.ticketDatasource.getActiveByUsuario(usuarioId);
    }

    update(
        id: string,
        ticket: Partial<Omit<TicketEntity, "id">>,
    ): Promise<TicketEntity | null> {
        return this.ticketDatasource.update(id, ticket);
    }

    delete(id: string): Promise<TicketEntity | null> {
        return this.ticketDatasource.delete(id);
    }
}