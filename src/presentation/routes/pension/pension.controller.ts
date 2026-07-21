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
      const allowedProjectIds = getAllowedProjectIdsFromRequest(req);
      const pensiones =
        !isSuperAdminRequest(req) && allowedProjectIds.length === 1
          ? await this.pensionService.getPensionesByProyecto(allowedProjectIds[0])
          : await this.pensionService.getPensiones();
      return res.status(200).json({ pensiones });
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
      const pension = await this.pensionService.deletePension(id);
      return res.status(200).json({ pension });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };
}
