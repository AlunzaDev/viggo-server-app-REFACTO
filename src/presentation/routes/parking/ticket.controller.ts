import { Request, Response } from "express";
import { CreateTicketDto } from "../../../domain/dtos/parking/create-ticket.dto";
import { UpdateTicketDto } from "../../../domain/dtos/parking/update-ticket.dto";
import { ErrorService } from "../../services/error.service";
import {
  canAccessProjectFromRequest,
  getAllowedProjectIdsFromRequest,
  isSuperAdminRequest,
} from "../../middlewares";
import { TicketService } from "../../services/parking/ticket.service";

export class TicketController {
  constructor(private readonly ticketService: TicketService) {}

  createTicket = async (req: Request, res: Response) => {
    try {
      const [error, createTicketDto] = CreateTicketDto.create(req.body);
      if (error) return res.status(400).json({ error });
      if (!canAccessProjectFromRequest(req, createTicketDto!.proyecto)) {
        return res.status(403).json({ error: "Forbidden" });
      }

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

  getTickets = async (req: Request, res: Response) => {
    try {
      const allowedProjectIds = getAllowedProjectIdsFromRequest(req);
      const tickets = await this.ticketService.getTickets();
      const filteredTickets = isSuperAdminRequest(req)
        ? tickets
        : tickets.filter((ticket) => allowedProjectIds.includes(ticket.proyecto));
      return res.status(200).json({ tickets: filteredTickets });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getTicketById = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const ticket = await this.ticketService.getTicketById(id);
      if (!canAccessProjectFromRequest(req, ticket.proyecto)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      return res.status(200).json({ ticket });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getTicketsByUsuario = async (req: Request, res: Response) => {
    try {
      const usuarioId = String(req.params.usuarioId);
      const tickets = await this.ticketService.getTicketsByUsuario(usuarioId);
      const filteredTickets = isSuperAdminRequest(req)
        ? tickets
        : tickets.filter((ticket) =>
            getAllowedProjectIdsFromRequest(req).includes(ticket.proyecto),
          );
      return res.status(200).json({ tickets: filteredTickets });
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

      const response = await this.ticketService.getHistoryTicketsByUsuario(
        usuarioId,
        req.query,
      );

      return res.status(200).json(response);
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

      const currentTicket = await this.ticketService.getTicketById(idTicket.trim());
      if (!canAccessProjectFromRequest(req, currentTicket.proyecto)) {
        return res.status(403).json({ error: "Forbidden" });
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
      if (ticket && !canAccessProjectFromRequest(req, ticket.proyecto)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      return res.status(200).json({ ticket });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  updateTicket = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const currentTicket = await this.ticketService.getTicketById(id);
      if (!canAccessProjectFromRequest(req, currentTicket.proyecto)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const [error, updateTicketDto] = UpdateTicketDto.create(req.body);
      if (error) return res.status(400).json({ error });
      if (
        updateTicketDto?.proyecto &&
        !canAccessProjectFromRequest(req, updateTicketDto.proyecto)
      ) {
        return res.status(403).json({ error: "Forbidden" });
      }

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
      const currentTicket = await this.ticketService.getTicketById(id);
      if (!canAccessProjectFromRequest(req, currentTicket.proyecto)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const ticket = await this.ticketService.deleteTicket(id);
      return res.status(200).json({ ticket });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };
}
