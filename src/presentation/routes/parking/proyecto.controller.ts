import { Request, Response } from "express";
import { CreateProyectoDto } from "../../../domain/dtos/parking/create-proyecto.dto";
import { ProyectoListQueryDto } from "../../../domain/dtos/parking/proyecto-list-query.dto";
import { UpdateProyectoDto } from "../../../domain/dtos/parking/update-proyecto.dto";
import { ErrorService } from "../../services/error.service";
import { deleteManagedProjectImage } from "../../../config/plugins/project-image.plugin";
import { projectAccessFromRequest } from "../../middlewares";
import type { ProyectoService } from "../../services/parking/proyecto.service";
import { toMobileParkingArea } from "../../services/parking/mobile-parking-area.presenter";
import {
  buildPaginatedResponse,
  paginateArray,
  parsePaginationDateQuery,
} from "../../services/shared/pagination-query";

const parseBooleanField = (value: unknown): boolean | undefined => {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return undefined;

  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;

  return undefined;
};

const parseCoordinatesField = (value: unknown): unknown => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return value;

  const normalized = value.trim();
  if (!normalized) return undefined;

  try {
    const parsed = JSON.parse(normalized);
    return Array.isArray(parsed) ? parsed : value;
  } catch {
    return value;
  }
};

const parseJsonField = (value: unknown): unknown => {
  if (typeof value !== "string") return value;

  const normalized = value.trim();
  if (!normalized) return undefined;

  try {
    return JSON.parse(normalized);
  } catch {
    return value;
  }
};

const normalizeProyectoRequestBody = (body: Record<string, unknown>) => {
  const normalizedBody: Record<string, unknown> = {
    ...body,
    coordinates: parseCoordinatesField(body.coordinates),
    remoteSupport: parseJsonField(body.remoteSupport),
  };

  const estado = parseBooleanField(body.estado);
  if (estado !== undefined) {
    normalizedBody.estado = estado;
  }

  return normalizedBody;
};

/** HTTP for the parkings: reads the (multipart) form; the rules and the user's scope live in ProyectoService. */
export class ProyectoController {
  constructor(private readonly proyectos: ProyectoService) {}

  getParkingRate = async (req: Request, res: Response) => {
    try {
      return res.status(200).json(await this.proyectos.getParkingRate(String(req.params.id), projectAccessFromRequest(req)));
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  createProyecto = async (req: Request, res: Response) => {
    try {
      const body = normalizeProyectoRequestBody(req.body as Record<string, unknown>);
      if (req.file?.filename) body.img = `/uploads/projects/${req.file.filename}`;
      const [error, dto] = CreateProyectoDto.create(body);
      if (error || !dto) return res.status(400).json({ error });
      return res.status(201).json(await this.proyectos.createProyecto(dto));
    } catch (error) {
      // The uploaded image is not kept when the parking was not created.
      if (req.file?.filename) deleteManagedProjectImage(`/uploads/projects/${req.file.filename}`);
      return ErrorService.handleApiError(error, res);
    }
  };

  /** Without `page`/`limit` the whole list; with them, a page. */
  getProyectos = async (req: Request, res: Response) => {
    try {
      const [error, query] = ProyectoListQueryDto.create(req.query as Record<string, unknown>);
      if (error || !query) return res.status(400).json({ error });
      const { page, limit } = parsePaginationDateQuery(req.query);
      const proyectos = await this.proyectos.listProyectos(query, projectAccessFromRequest(req));
      if (req.query.page === undefined && req.query.limit === undefined) return res.status(200).json({ proyectos });
      return res.status(200).json(buildPaginatedResponse("proyectos", paginateArray(proyectos, page, limit), proyectos.length, page, limit));
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  /** Catálogo mínimo para geodetección; no expone red, instalación ni soporte remoto. */
  getMobileParkingAreas = async (_req: Request, res: Response) => {
    try {
      const proyectos = (await this.proyectos.getProyectos()).filter((proyecto) => proyecto.estado).map(toMobileParkingArea);
      return res.status(200).json({ proyectos, total: proyectos.length });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getProyectoById = async (req: Request, res: Response) => {
    try {
      return res.status(200).json({ proyecto: await this.proyectos.getProyectoById(String(req.params.id), projectAccessFromRequest(req)) });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getInstallationLinkToken = async (req: Request, res: Response) => {
    try {
      return res.status(200).json(await this.proyectos.getInstallationLinkToken(String(req.params.id), projectAccessFromRequest(req)));
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  regenerateInstallationLinkToken = async (req: Request, res: Response) => {
    try {
      return res.status(200).json(await this.proyectos.regenerateInstallationLinkToken(String(req.params.id), projectAccessFromRequest(req)));
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  updateProyecto = async (req: Request, res: Response) => {
    try {
      const body = normalizeProyectoRequestBody(req.body as Record<string, unknown>);
      if (req.file?.filename) body.img = `/uploads/projects/${req.file.filename}`;
      else if (parseBooleanField(body.clearImage) === true) body.img = "";
      const [error, dto] = UpdateProyectoDto.create(body);
      if (error || !dto) return res.status(400).json({ error });
      return res.status(200).json({ proyecto: await this.proyectos.updateProyecto(String(req.params.id), dto, projectAccessFromRequest(req)) });
    } catch (error) {
      if (req.file?.filename) deleteManagedProjectImage(`/uploads/projects/${req.file.filename}`);
      return ErrorService.handleApiError(error, res);
    }
  };

  updateProyectoStatus = async (req: Request, res: Response) => {
    try {
      const { estado } = req.body as { estado?: unknown };
      if (typeof estado !== "boolean") return res.status(400).json({ error: "'estado' debe ser boolean" });
      return res.status(200).json({ proyecto: await this.proyectos.updateProyectoStatus(String(req.params.id), estado, projectAccessFromRequest(req)) });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  deleteProyecto = async (req: Request, res: Response) => {
    try {
      return res.status(200).json({ proyecto: await this.proyectos.deleteProyecto(String(req.params.id), projectAccessFromRequest(req)) });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };
}
