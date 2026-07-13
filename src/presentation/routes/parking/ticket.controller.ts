import { Request, Response } from "express";
import { CreateTicketDto } from "../../../domain/dtos/parking/create-ticket.dto";
import { UpdateTicketDto } from "../../../domain/dtos/parking/update-ticket.dto";
import { ErrorService } from "../../services/error.service";
import { TicketService } from "../../services/parking/ticket.service";

export class TicketController {
  constructor(private readonly ticketService: TicketService) {}

  createTicket = async (req: Request, res: Response) => {
    try {
      const [error, createTicketDto] = CreateTicketDto.create(req.body);
      if (error) return res.status(400).json({ error });

      const ticket = await this.ticketService.createTicket(createTicketDto!);
      return res.status(201).json({ ticket });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  createTicketLegacy = async (req: Request, res: Response) => {
    try {
      const authRequest = req as Request & { uid?: string };
      const usuarioId = authRequest.uid;
      const { moduleToken } = req.body as { moduleToken?: unknown };

      if (!usuarioId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (typeof moduleToken !== "string" || moduleToken.trim().length === 0) {
        return res.status(400).json({ error: "'moduleToken' es requerido" });
      }

      const ticket = await this.ticketService.createTicketFromModuleToken(
        usuarioId,
        moduleToken.trim(),
      );
      const legacyTicket =
        await this.ticketService.toLegacyTicketResponse(ticket);

      return res.status(200).json({ ticket: legacyTicket });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  killTicketLegacy = async (req: Request, res: Response) => {
    try {
      const authRequest = req as Request & { uid?: string };
      const usuarioId = authRequest.uid;
      const { moduleToken } = req.body as { moduleToken?: unknown };

      if (!usuarioId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (typeof moduleToken !== "string" || moduleToken.trim().length === 0) {
        return res.status(400).json({ error: "'moduleToken' es requerido" });
      }

      const ticket = await this.ticketService.killTicketFromModuleToken(
        usuarioId,
        moduleToken.trim(),
      );
      const legacyTicket =
        await this.ticketService.toLegacyTicketResponse(ticket);

      return res.status(200).json({ ticket: legacyTicket });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getTickets = async (_req: Request, res: Response) => {
    try {
      const tickets = await this.ticketService.getTickets();
      return res.status(200).json({ tickets });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getTicketById = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const ticket = await this.ticketService.getTicketById(id);
      return res.status(200).json({ ticket });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getTicketsByUsuario = async (req: Request, res: Response) => {
    try {
      const usuarioId = String(req.params.usuarioId);
      const tickets = await this.ticketService.getTicketsByUsuario(usuarioId);
      return res.status(200).json({ tickets });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getMyHistoryTickets = async (req: Request, res: Response) => {
    try {
      const authRequest = req as Request & { uid?: string };
      const usuarioId = authRequest.uid;

      if (!usuarioId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const tickets = await this.ticketService.getTicketsByUsuario(usuarioId);
      const legacyTickets =
        await this.ticketService.toLegacyTicketsResponse(tickets);
      return res.status(200).json({ tickets: legacyTickets });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getMyCurrentTicket = async (req: Request, res: Response) => {
    try {
      const authRequest = req as Request & { uid?: string };
      const usuarioId = authRequest.uid;

      if (!usuarioId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const ticket =
        await this.ticketService.getActiveTicketByUsuario(usuarioId);

      if (!ticket) {
        return res.status(204).send();
      }

      const legacyTicket =
        await this.ticketService.toLegacyTicketResponse(ticket);
      return res.status(200).json({ ticket: legacyTicket });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  payTicketLegacy = async (req: Request, res: Response) => {
    try {
      const { idTicket } = req.body as { idTicket?: unknown };

      if (typeof idTicket !== "string" || idTicket.trim().length === 0) {
        return res.status(400).json({ error: "'idTicket' es requerido" });
      }

      const ticket = await this.ticketService.updateTicket(idTicket.trim(), {
        pagado: true,
        horaCobro: Date.now(),
      });
      const legacyTicket =
        await this.ticketService.toLegacyTicketResponse(ticket);

      return res.status(200).json({ ticket: legacyTicket });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getActiveTicketByUsuario = async (req: Request, res: Response) => {
    try {
      const usuarioId = String(req.params.usuarioId);
      const ticket =
        await this.ticketService.getActiveTicketByUsuario(usuarioId);
      return res.status(200).json({ ticket });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  updateTicket = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const [error, updateTicketDto] = UpdateTicketDto.create(req.body);
      if (error) return res.status(400).json({ error });

      const ticket = await this.ticketService.updateTicket(
        id,
        updateTicketDto!,
      );
      return res.status(200).json({ ticket });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  deleteTicket = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const ticket = await this.ticketService.deleteTicket(id);
      return res.status(200).json({ ticket });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };
}
