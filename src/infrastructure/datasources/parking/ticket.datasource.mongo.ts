import { TicketModel } from "../../../data/mongo/models/parking/ticket.schema";
import { TicketDatasource } from "../../../domain/datasources/parking/ticket.datasource";
import { TicketEntity } from "../../../domain/entities/parking/ticket.entity";

export class TicketMongoDatasource extends TicketDatasource {
    async create(ticket: Omit<TicketEntity, "id">): Promise<TicketEntity> {
        const ticketDocument = await TicketModel.create(ticket);
        return TicketEntity.fromObject(ticketDocument.toObject());
    }

    async findById(id: string): Promise<TicketEntity | null> {
        const ticketDocument = await TicketModel.findById(id);
        if (!ticketDocument) return null;

        return TicketEntity.fromObject(ticketDocument.toObject());
    }

    async findByIdBoleto(idBoleto: string): Promise<TicketEntity | null> {
        const ticketDocument = await TicketModel.findOne({ idBoleto });
        if (!ticketDocument) return null;

        return TicketEntity.fromObject(ticketDocument.toObject());
    }

    async getAll(): Promise<TicketEntity[]> {
        const tickets = await TicketModel.find();
        return tickets.map((ticket) => TicketEntity.fromObject(ticket.toObject()));
    }

    async getByUsuario(usuarioId: string): Promise<TicketEntity[]> {
        const tickets = await TicketModel.find({ usuario: usuarioId });
        return tickets.map((ticket) => TicketEntity.fromObject(ticket.toObject()));
    }

    async getActiveByUsuario(usuarioId: string): Promise<TicketEntity | null> {
        const ticketDocument = await TicketModel.findOne({
            usuario: usuarioId,
            horaSalida: -1,
        });

        if (!ticketDocument) return null;

        return TicketEntity.fromObject(ticketDocument.toObject());
    }

    async update(
        id: string,
        ticket: Partial<Omit<TicketEntity, "id">>,
    ): Promise<TicketEntity | null> {
        const ticketDocument = await TicketModel.findByIdAndUpdate(id, ticket, {
            new: true,
        });

        if (!ticketDocument) return null;

        return TicketEntity.fromObject(ticketDocument.toObject());
    }

    async delete(id: string): Promise<TicketEntity | null> {
        const ticketDocument = await TicketModel.findByIdAndDelete(id);

        if (!ticketDocument) return null;

        return TicketEntity.fromObject(ticketDocument.toObject());
    }
}