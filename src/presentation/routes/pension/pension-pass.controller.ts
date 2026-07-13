import { Request, Response } from "express";
import { CreatePensionPassDto } from "../../../domain/dtos/pension/create-pension-pass.dto";
import { UpdatePensionPassDto } from "../../../domain/dtos/pension/update-pension-pass.dto";
import { ErrorService } from "../../services/error.service";
import { PensionPassService } from "../../services/pension/pension-pass.service";

export class PensionPassController {
  constructor(private readonly pensionPassService: PensionPassService) {}

  createPensionPass = async (req: Request, res: Response) => {
    try {
      const [error, createPensionPassDto] = CreatePensionPassDto.create(
        req.body,
      );
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
      const pensionPass =
        await this.pensionPassService.getPensionPassCardById(id);
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

  getMyPensionPasses = async (req: Request, res: Response) => {
    try {
      const authRequest = req as Request & { uid?: string };
      const usuarioId = authRequest.uid;

      if (!usuarioId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const pensionPasses =
        await this.pensionPassService.getPensionPassCardsByUsuario(usuarioId);

      return res.status(200).json({ pensionPasses });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  openBarrierWithPensionPass = async (req: Request, res: Response) => {
    try {
      const authRequest = req as Request & { uid?: string };
      const usuarioId = authRequest.uid;
      const { moduleToken, pensionPass } = req.body as {
        moduleToken?: unknown;
        pensionPass?: unknown;
      };

      if (!usuarioId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (typeof moduleToken !== "string" || moduleToken.trim().length === 0) {
        return res.status(400).json({ error: "'moduleToken' es requerido" });
      }

      if (typeof pensionPass !== "string" || pensionPass.trim().length === 0) {
        return res.status(400).json({ error: "'pensionPass' es requerido" });
      }

      const pensionMove =
        await this.pensionPassService.openBarrierWithPensionPass(
          usuarioId,
          pensionPass.trim(),
          moduleToken.trim(),
        );

      return res.status(200).json({ pensionMove });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getPensionMovesByPensionPass = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const response =
        await this.pensionPassService.getPensionMovesByPensionPass(id);

      return res.status(200).json(response);
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  precontractPensionPass = async (req: Request, res: Response) => {
    try {
      const authRequest = req as Request & { uid?: string };
      const usuarioId = authRequest.uid;
      const { pension, contractMonths = 1 } = req.body as {
        pension?: unknown;
        contractMonths?: unknown;
      };

      if (!usuarioId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (typeof pension !== "string" || pension.trim().length === 0) {
        return res.status(400).json({ error: "'pension' es requerida" });
      }

      const pensionPass =
        await this.pensionPassService.precontractPensionPass(
          usuarioId,
          pension.trim(),
          Number(contractMonths),
        );

      return res.status(200).json({ pensionPass });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  renewPensionPass = async (req: Request, res: Response) => {
    try {
      const authRequest = req as Request & { uid?: string };
      const usuarioId = authRequest.uid;
      const id = String(req.params.id);
      const { contractMonths = 1 } = req.body as { contractMonths?: unknown };

      if (!usuarioId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const pensionPass = await this.pensionPassService.renewPensionPass(
        usuarioId,
        id,
        Number(contractMonths),
      );

      return res.status(200).json({ pensionPass });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  contractPensionPass = async (req: Request, res: Response) => {
    try {
      const authRequest = req as Request & { uid?: string };
      const usuarioId = authRequest.uid;
      const id = String(req.params.id);

      if (!usuarioId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const pensionPass = await this.pensionPassService.contractPensionPass(
        usuarioId,
        id,
      );

      return res.status(200).json({ pensionPass });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  updatePensionPass = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const [error, updatePensionPassDto] = UpdatePensionPassDto.create(
        req.body,
      );
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

      const pensionPass = await this.pensionPassService.updatePensionPassStatus(
        id,
        estado,
      );
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
