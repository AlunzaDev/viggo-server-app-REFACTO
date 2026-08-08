import { Request, Response } from "express";
import { CreatePensionDto } from "../../../domain/dtos/pension/create-pension.dto";
import { UpdatePensionDto } from "../../../domain/dtos/pension/update-pension.dto";
import { ErrorService } from "../../services/error.service";
import {
  canAccessProjectFromRequest,
  getAllowedProjectIdsFromRequest,
  isSuperAdminRequest,
} from "../../middlewares";
import { PensionService } from "../../services/pension/pension.service";
import {
  buildPaginatedResponse,
  paginateArray,
  parsePaginationDateQuery,
} from "../../services/shared/pagination-query";

type AuthenticatedRequest = Request & { uid?: string };

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

export class PensionController {
  constructor(private readonly pensionService: PensionService) {}

  createPension = async (req: Request, res: Response) => {
    try {
      const [error, createPensionDto] = CreatePensionDto.create(req.body);
      if (error) return res.status(400).json({ error });
      if (!canAccessProjectFromRequest(req, createPensionDto!.proyecto)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const pension = await this.pensionService.createPension(createPensionDto!);
      return res.status(201).json({ pension });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getPensiones = async (req: Request, res: Response) => {
    try {
      const estado = parseBooleanQuery(req.query.estado);
      if (estado === null) {
        return res.status(400).json({ error: "'estado' debe ser boolean" });
      }

      const proyecto =
        typeof req.query.proyecto === "string" ? req.query.proyecto.trim() : "";
      const search =
        typeof req.query.search === "string" ? req.query.search.trim() : "";
      const shouldPaginate =
        req.query.page !== undefined || req.query.limit !== undefined;
      const { page, limit } = parsePaginationDateQuery(req.query);
      const allowedProjectIds = getAllowedProjectIdsFromRequest(req);
      const pensiones =
        !isSuperAdminRequest(req) && allowedProjectIds.length === 1
          ? await this.pensionService.getPensionesByProyecto(allowedProjectIds[0])
          : await this.pensionService.getPensiones();
      let visible = pensiones;

      if (proyecto) {
        visible = visible.filter((pension) => pension.proyecto === proyecto);
      }

      if (estado !== undefined) {
        visible = visible.filter((pension) => pension.estado === estado);
      }

      if (search) {
        const normalizedSearch = normalizeText(search);
        visible = visible.filter((pension) =>
          [
            pension.nombre,
            pension.descripcion ?? "",
            String(pension.precio),
          ].some((value) => normalizeText(String(value ?? "")).includes(normalizedSearch)),
        );
      }

      if (!shouldPaginate) {
        return res.status(200).json({ pensiones: visible });
      }

      return res.status(200).json(
        buildPaginatedResponse(
          "pensiones",
          paginateArray(visible, page, limit),
          visible.length,
          page,
          limit,
        ),
      );
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getPensionById = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const pension = await this.pensionService.getPensionById(id);
      if (!canAccessProjectFromRequest(req, pension.proyecto)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      return res.status(200).json({ pension });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getPensionesByProyecto = async (req: Request, res: Response) => {
    try {
      const proyectoId = String(req.params.proyectoId);
      if (!canAccessProjectFromRequest(req, proyectoId)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const pensiones =
        await this.pensionService.getPensionesByProyecto(proyectoId);
      return res.status(200).json({ pensiones });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  updatePension = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const currentPension = await this.pensionService.getPensionById(id);
      if (!canAccessProjectFromRequest(req, currentPension.proyecto)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const [error, updatePensionDto] = UpdatePensionDto.create(req.body);
      if (error) return res.status(400).json({ error });
      if (
        updatePensionDto?.proyecto &&
        !canAccessProjectFromRequest(req, updatePensionDto.proyecto)
      ) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const pension = await this.pensionService.updatePension(id, updatePensionDto!);
      return res.status(200).json({ pension });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  updatePensionStatus = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const currentPension = await this.pensionService.getPensionById(id);
      if (!canAccessProjectFromRequest(req, currentPension.proyecto)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const { estado } = req.body as { estado?: unknown };

      if (typeof estado !== "boolean") {
        return res.status(400).json({ error: "'estado' debe ser boolean" });
      }

      const pension = await this.pensionService.updatePensionStatus(id, estado);
      return res.status(200).json({ pension });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  deletePension = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const currentPension = await this.pensionService.getPensionById(id);
      if (!canAccessProjectFromRequest(req, currentPension.proyecto)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const uid = String((req as AuthenticatedRequest).uid ?? "");
      const reason = String(req.body?.reason ?? "Cancelacion administrativa").trim();
      const pension = await this.pensionService.deletePension(id, uid, reason);
      return res.status(200).json({ pension });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };
}
