import { Request, Response } from "express";
import { CreateProyectoDto } from "../../../domain/dtos/parking/create-proyecto.dto";
import { UpdateProyectoDto } from "../../../domain/dtos/parking/update-proyecto.dto";
import { ErrorService } from "../../services/error.service";
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

  getProyectos = async (_req: Request, res: Response) => {
    try {
      const proyectos = await this.proyectoService.getProyectos();
      return res.status(200).json({ proyectos });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getProyectoById = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const proyecto = await this.proyectoService.getProyectoById(id);
      return res.status(200).json({ proyecto });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  updateProyecto = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
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
      const proyecto = await this.proyectoService.deleteProyecto(id);
      return res.status(200).json({ proyecto });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };
}
