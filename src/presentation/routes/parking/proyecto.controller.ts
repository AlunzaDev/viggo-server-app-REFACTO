import { Request, Response } from "express";
import { CreateProyectoDto } from "../../../domain/dtos/parking/create-proyecto.dto";
import { UpdateProyectoDto } from "../../../domain/dtos/parking/update-proyecto.dto";
import { ErrorService } from "../../services/error.service";
import {
  canAccessProjectFromRequest,
  getAllowedProjectIdsFromRequest,
  isSuperAdminRequest,
} from "../../middlewares";
import { ProyectoService } from "../../services/parking/proyecto.service";

export class ProyectoController {
  constructor(private readonly proyectoService: ProyectoService) {}

  createProyecto = async (req: Request, res: Response) => {
    try {
      const [error, createProyectoDto] = CreateProyectoDto.create(req.body);
      if (error) return res.status(400).json({ error });

      const proyecto = await this.proyectoService.createProyecto(createProyectoDto!);
      return res.status(201).json({ proyecto });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getProyectos = async (req: Request, res: Response) => {
    try {
      const proyectos = await this.proyectoService.getProyectos();
      const allowedProjectIds = getAllowedProjectIdsFromRequest(req);
      const filteredProjects = isSuperAdminRequest(req)
        ? proyectos
        : proyectos.filter((proyecto) => allowedProjectIds.includes(proyecto.id));
      return res.status(200).json({ proyectos: filteredProjects });
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

  updateProyecto = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      if (!canAccessProjectFromRequest(req, id)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const [error, updateProyectoDto] = UpdateProyectoDto.create(req.body);
      if (error) return res.status(400).json({ error });

      const proyecto = await this.proyectoService.updateProyecto(id, updateProyectoDto!);
      return res.status(200).json({ proyecto });
    } catch (error) {
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
