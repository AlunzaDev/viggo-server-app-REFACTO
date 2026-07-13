import { JwtPlugin } from "../../../config/plugins/jwt.plugin";
import { TicketEntity } from "../../../domain/entities/parking/ticket.entity";
import { CustomError } from "../../../domain/errors/custom.error";
import { ModuloRepository } from "../../../domain/repository/parking/modulo.repository";
import { ProyectoRepository } from "../../../domain/repository/parking/proyecto.repository";
import { TicketRepository } from "../../../domain/repository/parking/ticket.repository";
import { SocketServerPlugin } from "../../sockets/socket-server";

interface LegacyTicketResponse {
  uid: string;
  proyecto: {
    _id: string;
    nombre: string;
    ciudad: string;
  };
  entrada: {
    _id: string;
    nombre: string;
  };
  usuario: string;
  idBoleto: string;
  horaInicio: number;
  salida?: string;
  horaConsulta: number;
  horaCobro: number;
  horaSalida: number;
  duracion: number;
  monto: number;
  pagado: boolean;
}

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

  async createTicketFromModuleToken(
    usuarioId: string,
    moduleToken: string,
  ): Promise<TicketEntity> {
    const moduloId = await this.getModuloIdFromToken(moduleToken);
    const modulo = await this.moduloRepository.findById(moduloId);

    if (!modulo) {
      throw CustomError.badRequest("El modulo de entrada no existe");
    }

    const proyecto = await this.proyectoRepository.findById(modulo.proyecto);

    if (!proyecto) {
      throw CustomError.badRequest("El proyecto asociado no existe");
    }

    await SocketServerPlugin.openBarrier(modulo.id);

    return this.createTicket({
      proyecto: proyecto.id,
      entrada: modulo.id,
      usuario: usuarioId,
      idBoleto: this.createIdBoleto(
        proyecto.identificador,
        modulo.identificador,
      ),
      horaInicio: Date.now(),
      horaConsulta: -1,
      horaCobro: -1,
      horaSalida: -1,
      duracion: 0,
      monto: 0,
      pagado: false,
    });
  }

  async killTicketFromModuleToken(
    usuarioId: string,
    moduleToken: string,
  ): Promise<TicketEntity> {
    const ticket = await this.ticketRepository.getActiveByUsuario(usuarioId);

    if (!ticket || !ticket.pagado) {
      throw CustomError.badRequest("No cuenta con un ticket pagado para salir");
    }

    const moduloId = await this.getModuloIdFromToken(moduleToken);
    const modulo = await this.moduloRepository.findById(moduloId);

    if (!modulo) {
      throw CustomError.badRequest("El modulo de salida no existe");
    }

    await SocketServerPlugin.openBarrier(modulo.id);

    return this.updateTicket(ticket.id, {
      salida: modulo.id,
      horaSalida: Date.now(),
    });
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

  async toLegacyTicketResponse(
    ticket: TicketEntity,
  ): Promise<LegacyTicketResponse> {
    const [proyecto, entrada] = await Promise.all([
      this.proyectoRepository.findById(ticket.proyecto),
      this.moduloRepository.findById(ticket.entrada),
    ]);

    return {
      uid: ticket.id,
      proyecto: {
        _id: ticket.proyecto,
        nombre: proyecto?.nombre ?? "",
        ciudad: proyecto?.ciudad ?? "---",
      },
      entrada: {
        _id: ticket.entrada,
        nombre: entrada?.nombre ?? "",
      },
      usuario: ticket.usuario,
      idBoleto: ticket.idBoleto,
      horaInicio: ticket.horaInicio,
      salida: ticket.salida,
      horaConsulta: ticket.horaConsulta,
      horaCobro: ticket.horaCobro,
      horaSalida: ticket.horaSalida,
      duracion: ticket.duracion,
      monto: ticket.monto,
      pagado: ticket.pagado,
    };
  }

  async toLegacyTicketsResponse(
    tickets: TicketEntity[],
  ): Promise<LegacyTicketResponse[]> {
    return Promise.all(
      tickets.map((ticket) => this.toLegacyTicketResponse(ticket)),
    );
  }

  private async getModuloIdFromToken(moduleToken: string): Promise<string> {
    const payload = await JwtPlugin.validateToken(moduleToken);

    if (!payload || typeof payload !== "object") {
      throw CustomError.badRequest("El token de entrada es invalido");
    }

    const moduloId =
      "id" in payload
        ? String(payload.id)
        : "uid" in payload
          ? String(payload.uid)
          : "";

    if (!moduloId) {
      throw CustomError.badRequest("El token de entrada es invalido");
    }

    return moduloId;
  }

  private createIdBoleto(
    proyectoIdentificador: string,
    moduloIdentificador: string,
  ): string {
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, "0");
    const datePart = [
      pad(now.getDate()),
      pad(now.getMonth() + 1),
      String(now.getFullYear()).slice(-2),
      pad(now.getHours()),
      pad(now.getMinutes()),
      pad(now.getSeconds()),
    ].join("");

    return `00${datePart}${proyectoIdentificador}${moduloIdentificador}`;
  }
}
