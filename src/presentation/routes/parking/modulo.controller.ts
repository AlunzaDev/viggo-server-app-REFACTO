import { Request, Response } from "express";
import { CreateModuloDto } from "../../../domain/dtos/parking/create-modulo.dto";
import { UpdateModuloDto } from "../../../domain/dtos/parking/update-modulo.dto";
import { ErrorService } from "../../services/error.service";
import { ModuloService } from "../../services/parking/modulo.service";

export class ModuloController {
  constructor(private readonly moduloService: ModuloService) {}

  createModulo = async (req: Request, res: Response) => {
    try {
      const [error, createModuloDto] = CreateModuloDto.create(req.body);
      if (error) return res.status(400).json({ error });

      const modulo = await this.moduloService.createModulo(createModuloDto!);
      return res.status(201).json({ modulo });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getModulos = async (_req: Request, res: Response) => {
    try {
      const modulos = await this.moduloService.getModulos();
      return res.status(200).json({ modulos });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getModuloById = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const modulo = await this.moduloService.getModuloById(id);
      return res.status(200).json({ modulo });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getModulosByProyecto = async (req: Request, res: Response) => {
    try {
      const proyectoId = String(req.params.proyectoId);
      const modulos = await this.moduloService.getModulosByProyecto(proyectoId);
      return res.status(200).json({ modulos });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  updateModulo = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const [error, updateModuloDto] = UpdateModuloDto.create(req.body);
      if (error) return res.status(400).json({ error });

      const modulo = await this.moduloService.updateModulo(id, updateModuloDto!);
      return res.status(200).json({ modulo });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  updateModuloStatus = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const { estado } = req.body as { estado?: unknown };

      if (typeof estado !== "boolean") {
        return res.status(400).json({ error: "'estado' debe ser boolean" });
      }

      const modulo = await this.moduloService.updateModuloStatus(id, estado);
      return res.status(200).json({ modulo });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  deleteModulo = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const modulo = await this.moduloService.deleteModulo(id);
      return res.status(200).json({ modulo });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };
}
