import { Request, Response } from "express";
import { CreateProyectoDto } from "../../../domain/dtos/parking/create-proyecto.dto";
import { UpdateProyectoDto } from "../../../domain/dtos/parking/update-proyecto.dto";
import { ErrorService } from "../../services/error.service";
import { deleteManagedProjectImage } from "../../utils/project-image.util";
import {
  canAccessProjectFromRequest,
  getAllowedProjectIdsFromRequest,
  isSuperAdminRequest,
} from "../../middlewares";
import { ProyectoService } from "../../services/parking/proyecto.service";
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

const normalizeText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const parseBooleanQuery = (value: unknown): boolean | undefined | null => {
  if (value === undefined) return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return null;

  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;

  return null;
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

export class ProyectoController {
  constructor(private readonly proyectoService: ProyectoService) {}

  createProyecto = async (req: Request, res: Response) => {
    try {
      const body = normalizeProyectoRequestBody(req.body as Record<string, unknown>);
      if (req.file?.filename) {
        body.img = `/uploads/projects/${req.file.filename}`;
      }

      const [error, createProyectoDto] = CreateProyectoDto.create(body);
      if (error) return res.status(400).json({ error });

      const result = await this.proyectoService.createProyecto(createProyectoDto!);
      return res.status(201).json(result);
    } catch (error) {
      if (req.file?.filename) {
        deleteManagedProjectImage(`/uploads/projects/${req.file.filename}`);
      }
      return ErrorService.handleApiError(error, res);
    }
  };

  getProyectos = async (req: Request, res: Response) => {
    try {
      const estado = parseBooleanQuery(req.query.estado);
      if (estado === null) {
        return res.status(400).json({ error: "'estado' debe ser boolean" });
      }

      const ciudad =
        typeof req.query.ciudad === "string" ? req.query.ciudad.trim() : "";
      const search =
        typeof req.query.search === "string" ? req.query.search.trim() : "";
      const shouldPaginate =
        req.query.page !== undefined || req.query.limit !== undefined;
      const { page, limit } = parsePaginationDateQuery(req.query);
      const proyectos = await this.proyectoService.getProyectos();
      const allowedProjectIds = getAllowedProjectIdsFromRequest(req);
      let filteredProjects = isSuperAdminRequest(req)
        ? proyectos
        : proyectos.filter((proyecto) => allowedProjectIds.includes(proyecto.id));

      if (estado !== undefined) {
        filteredProjects = filteredProjects.filter((proyecto) => proyecto.estado === estado);
      }

      if (ciudad) {
        const normalizedCity = normalizeText(ciudad);
        filteredProjects = filteredProjects.filter(
          (proyecto) => normalizeText(proyecto.ciudad).includes(normalizedCity),
        );
      }

      if (search) {
        const normalizedSearch = normalizeText(search);
        filteredProjects = filteredProjects.filter((proyecto) =>
          [
            proyecto.nombre,
            proyecto.identificador,
            proyecto.ciudad,
            proyecto.direccion ?? "",
            proyecto.descripcion ?? "",
          ].some((value) => normalizeText(String(value ?? "")).includes(normalizedSearch)),
        );
      }

      if (!shouldPaginate) {
        return res.status(200).json({ proyectos: filteredProjects });
      }

      return res.status(200).json(
        buildPaginatedResponse(
          "proyectos",
          paginateArray(filteredProjects, page, limit),
          filteredProjects.length,
          page,
          limit,
        ),
      );
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  /** Catálogo mínimo para geodetección; no expone red, instalación ni soporte remoto. */
  getMobileParkingAreas = async (_req: Request, res: Response) => {
    try {
      const proyectos = (await this.proyectoService.getProyectos())
        .filter((proyecto) => proyecto.estado)
        .map(toMobileParkingArea);
      return res.status(200).json({ proyectos, total: proyectos.length });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getProyectoById = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      if (!canAccessProjectFromRequest(req, id)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const proyecto = await this.proyectoService.getProyectoById(id);
      return res.status(200).json({ proyecto });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getInstallationLinkToken = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      if (!canAccessProjectFromRequest(req, id)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const result = await this.proyectoService.getInstallationLinkToken(id);
      return res.status(200).json(result);
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  regenerateInstallationLinkToken = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      if (!canAccessProjectFromRequest(req, id)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const result = await this.proyectoService.regenerateInstallationLinkToken(id);
      return res.status(200).json(result);
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  updateProyecto = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      if (!canAccessProjectFromRequest(req, id)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const body = normalizeProyectoRequestBody(req.body as Record<string, unknown>);
      const clearImage = parseBooleanField(body.clearImage) === true;

      if (req.file?.filename) {
        body.img = `/uploads/projects/${req.file.filename}`;
      } else if (clearImage) {
        body.img = "";
      }

      const [error, updateProyectoDto] = UpdateProyectoDto.create(body);
      if (error) return res.status(400).json({ error });

      const proyecto = await this.proyectoService.updateProyecto(id, updateProyectoDto!);
      return res.status(200).json({ proyecto });
    } catch (error) {
      if (req.file?.filename) {
        deleteManagedProjectImage(`/uploads/projects/${req.file.filename}`);
      }
      return ErrorService.handleApiError(error, res);
    }
  };

  updateProyectoStatus = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      if (!canAccessProjectFromRequest(req, id)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const { estado } = req.body as { estado?: unknown };

      if (typeof estado !== "boolean") {
        return res.status(400).json({ error: "'estado' debe ser boolean" });
      }

      const proyecto = await this.proyectoService.updateProyectoStatus(
        id,
        estado,
      );
      return res.status(200).json({ proyecto });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  deleteProyecto = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      if (!canAccessProjectFromRequest(req, id)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const proyecto = await this.proyectoService.deleteProyecto(id);
      return res.status(200).json({ proyecto });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };
}
