import { Request, Response } from "express";
import { CreatePensionMoveDto } from "../../../domain/dtos/pension/create-pension-move.dto";
import { UpdatePensionMoveDto } from "../../../domain/dtos/pension/update-pension-move.dto";
import { ErrorService } from "../../services/error.service";
import { PensionMoveService } from "../../services/pension/pension-move.service";

export class PensionMoveController {
  constructor(private readonly pensionMoveService: PensionMoveService) {}

  createPensionMove = async (req: Request, res: Response) => {
    try {
      const [error, createPensionMoveDto] = CreatePensionMoveDto.create(req.body);
      if (error) return res.status(400).json({ error });

      const pensionMove = await this.pensionMoveService.createPensionMove(
        createPensionMoveDto!,
      );
      return res.status(201).json({ pensionMove });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getPensionMoves = async (_req: Request, res: Response) => {
    try {
      const pensionMoves = await this.pensionMoveService.getPensionMoves();
      return res.status(200).json({ pensionMoves });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getPensionMoveById = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const pensionMove = await this.pensionMoveService.getPensionMoveById(id);
      return res.status(200).json({ pensionMove });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getPensionMovesByPensionPass = async (req: Request, res: Response) => {
    try {
      const pensionPassId = String(req.params.pensionPassId);
      const pensionMoves =
        await this.pensionMoveService.getPensionMovesByPensionPass(
          pensionPassId,
        );
      return res.status(200).json({ pensionMoves });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getPensionMovesByProyecto = async (req: Request, res: Response) => {
    try {
      const proyectoId = String(req.params.proyectoId);
      const pensionMoves =
        await this.pensionMoveService.getPensionMovesByProyecto(proyectoId);
      return res.status(200).json({ pensionMoves });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  updatePensionMove = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const [error, updatePensionMoveDto] = UpdatePensionMoveDto.create(req.body);
      if (error) return res.status(400).json({ error });

      const pensionMove = await this.pensionMoveService.updatePensionMove(
        id,
        updatePensionMoveDto!,
      );
      return res.status(200).json({ pensionMove });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  deletePensionMove = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const pensionMove = await this.pensionMoveService.deletePensionMove(id);
      return res.status(200).json({ pensionMove });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };
}
