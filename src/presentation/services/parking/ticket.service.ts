import { TicketEntity } from "../../../domain/entities/parking/ticket.entity";
import { CustomError } from "../../../domain/errors/custom.error";
import { ModuloRepository } from "../../../domain/repository/parking/modulo.repository";
import { ProyectoRepository } from "../../../domain/repository/parking/proyecto.repository";
import { TicketRepository } from "../../../domain/repository/parking/ticket.repository";

export class TicketService {
  constructor(
    private readonly ticketRepository: TicketRepository,
    private readonly proyectoRepository: ProyectoRepository,
    private readonly moduloRepository: ModuloRepository,
  ) {}

  async createTicket(ticket: Omit<TicketEntity, "id">): Promise<TicketEntity> {
    const proyecto = await this.proyectoRepository.findById(ticket.proyecto);

    if (!proyecto) {
      throw CustomError.badRequest("El proyecto asociado no existe");
    }

    const moduloEntrada = await this.moduloRepository.findById(ticket.entrada);

    if (!moduloEntrada) {
      throw CustomError.badRequest("El modulo de entrada no existe");
    }

    const ticketExists = await this.ticketRepository.findByIdBoleto(
      ticket.idBoleto,
    );

    if (ticketExists) {
      throw CustomError.badRequest(
        `El ticket con idBoleto '${ticket.idBoleto}' ya existe`,
      );
    }

    const activeTicket = await this.ticketRepository.getActiveByUsuario(
      ticket.usuario,
    );

    if (activeTicket) {
      throw CustomError.badRequest("El usuario ya tiene un ticket activo");
    }

    return this.ticketRepository.create(ticket);
  }

  async getTickets(): Promise<TicketEntity[]> {
    return this.ticketRepository.getAll();
  }

  async getTicketById(id: string): Promise<TicketEntity> {
    const ticket = await this.ticketRepository.findById(id);

    if (!ticket) {
      throw CustomError.notFound("Ticket no encontrado");
    }

    return ticket;
  }

  async getTicketsByUsuario(usuarioId: string): Promise<TicketEntity[]> {
    return this.ticketRepository.getByUsuario(usuarioId);
  }

  async getActiveTicketByUsuario(
    usuarioId: string,
  ): Promise<TicketEntity | null> {
    return this.ticketRepository.getActiveByUsuario(usuarioId);
  }

  async updateTicket(
    id: string,
    ticket: Partial<Omit<TicketEntity, "id">>,
  ): Promise<TicketEntity> {
    const ticketUpdated = await this.ticketRepository.update(id, ticket);

    if (!ticketUpdated) {
      throw CustomError.notFound("Ticket no encontrado");
    }

    return ticketUpdated;
  }

  async deleteTicket(id: string): Promise<TicketEntity> {
    const ticketDeleted = await this.ticketRepository.delete(id);

    if (!ticketDeleted) {
      throw CustomError.notFound("Ticket no encontrado");
    }

    return ticketDeleted;
  }
}
