import { Request, Response } from "express";
import { CreatePensionPassDto } from "../../../domain/dtos/pension/create-pension-pass.dto";
import { UpdatePensionPassDto } from "../../../domain/dtos/pension/update-pension-pass.dto";
import { ErrorService } from "../../services/error.service";
import { PensionPassService } from "../../services/pension/pension-pass.service";

export class PensionPassController {
  constructor(private readonly pensionPassService: PensionPassService) {}

  createPensionPass = async (req: Request, res: Response) => {
    try {
      const [error, createPensionPassDto] = CreatePensionPassDto.create(req.body);
      if (error) return res.status(400).json({ error });

      const pensionPass = await this.pensionPassService.createPensionPass(
        createPensionPassDto!,
      );
      return res.status(201).json({ pensionPass });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getPensionPasses = async (_req: Request, res: Response) => {
    try {
      const pensionPasses = await this.pensionPassService.getPensionPasses();
      return res.status(200).json({ pensionPasses });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getPensionPassById = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const pensionPass = await this.pensionPassService.getPensionPassById(id);
      return res.status(200).json({ pensionPass });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getPensionPassesByPension = async (req: Request, res: Response) => {
    try {
      const pensionId = String(req.params.pensionId);
      const pensionPasses =
        await this.pensionPassService.getPensionPassesByPension(pensionId);
      return res.status(200).json({ pensionPasses });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getPensionPassesByUsuario = async (req: Request, res: Response) => {
    try {
      const usuarioId = String(req.params.usuarioId);
      const pensionPasses =
        await this.pensionPassService.getPensionPassesByUsuario(usuarioId);
      return res.status(200).json({ pensionPasses });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  updatePensionPass = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const [error, updatePensionPassDto] = UpdatePensionPassDto.create(req.body);
      if (error) return res.status(400).json({ error });

      const pensionPass = await this.pensionPassService.updatePensionPass(
        id,
        updatePensionPassDto!,
      );
      return res.status(200).json({ pensionPass });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  updatePensionPassStatus = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const { estado } = req.body as { estado?: unknown };

      if (typeof estado !== "boolean") {
        return res.status(400).json({ error: "'estado' debe ser boolean" });
      }

      const pensionPass =
        await this.pensionPassService.updatePensionPassStatus(id, estado);
      return res.status(200).json({ pensionPass });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  deletePensionPass = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const pensionPass = await this.pensionPassService.deletePensionPass(id);
      return res.status(200).json({ pensionPass });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };
}
