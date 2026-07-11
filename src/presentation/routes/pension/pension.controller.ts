import { Request, Response } from "express";
import { CreatePensionDto } from "../../../domain/dtos/pension/create-pension.dto";
import { UpdatePensionDto } from "../../../domain/dtos/pension/update-pension.dto";
import { ErrorService } from "../../services/error.service";
import { PensionService } from "../../services/pension/pension.service";

export class PensionController {
  constructor(private readonly pensionService: PensionService) {}

  createPension = async (req: Request, res: Response) => {
    try {
      const [error, createPensionDto] = CreatePensionDto.create(req.body);
      if (error) return res.status(400).json({ error });

      const pension = await this.pensionService.createPension(createPensionDto!);
      return res.status(201).json({ pension });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getPensiones = async (_req: Request, res: Response) => {
    try {
      const pensiones = await this.pensionService.getPensiones();
      return res.status(200).json({ pensiones });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getPensionById = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const pension = await this.pensionService.getPensionById(id);
      return res.status(200).json({ pension });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getPensionesByProyecto = async (req: Request, res: Response) => {
    try {
      const proyectoId = String(req.params.proyectoId);
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
      const [error, updatePensionDto] = UpdatePensionDto.create(req.body);
      if (error) return res.status(400).json({ error });

      const pension = await this.pensionService.updatePension(id, updatePensionDto!);
      return res.status(200).json({ pension });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  updatePensionStatus = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
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
      const pension = await this.pensionService.deletePension(id);
      return res.status(200).json({ pension });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };
}
