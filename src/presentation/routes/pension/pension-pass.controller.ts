import { Request, Response } from "express";
import { CreatePensionPassDto } from "../../../domain/dtos/pension/create-pension-pass.dto";
import { UpdatePensionPassDto } from "../../../domain/dtos/pension/update-pension-pass.dto";
import {
  canAccessProjectFromRequest,
  getAllowedProjectIdsFromRequest,
  isSuperAdminRequest,
} from "../../middlewares";
import { ErrorService } from "../../services/error.service";
import { PensionPassService } from "../../services/pension/pension-pass.service";

type AuthenticatedRequest = Request & { uid?: string };

export class PensionPassController {
  constructor(private readonly service: PensionPassService) {}

  createPensionPass = async (req: Request, res: Response) => {
    try {
      const [error, dto] = CreatePensionPassDto.create(req.body);
      if (error || !dto) return res.status(400).json({ error });
      const projectId = await this.service.getProyectoIdByPensionId(dto.pension);
      if (!canAccessProjectFromRequest(req, projectId)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const pensionPass = await this.service.createPensionPass({
        ...dto,
        antiPassback: true,
        inParking: false,
      });
      return res.status(201).json({ pensionPass });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getPensionPasses = async (req: Request, res: Response) => {
    try {
      let pensionPasses = await this.service.getPensionPasses();
      if (!isSuperAdminRequest(req)) {
        const allowed = getAllowedProjectIdsFromRequest(req);
        const batches = await Promise.all(
          allowed.map((id) => this.service.getPensionPassesByProyecto(id)),
        );
        const ids = new Set(batches.flat().map((pass) => pass.id));
        pensionPasses = pensionPasses.filter((pass) => ids.has(pass.id));
      }
      return res.status(200).json({ pensionPasses });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getPensionPassById = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const projectId = await this.service.getProyectoIdByPensionPassId(id);
      if (!canAccessProjectFromRequest(req, projectId)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      return res.status(200).json({ pensionPass: await this.service.getPensionPassById(id) });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getPensionPassesByPension = async (req: Request, res: Response) => {
    try {
      const pensionId = String(req.params.pensionId);
      const projectId = await this.service.getProyectoIdByPensionId(pensionId);
      if (!canAccessProjectFromRequest(req, projectId)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      return res.status(200).json({
        pensionPasses: await this.service.getPensionPassesByPension(pensionId),
      });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getPensionPassesByUsuario = async (req: Request, res: Response) => {
    try {
      const pensionPasses = await this.service.getPensionPassesByUsuario(
        String(req.params.usuarioId),
      );
      return res.status(200).json({ pensionPasses });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getMyPensionPasses = async (req: Request, res: Response) => {
    try {
      const uid = (req as AuthenticatedRequest).uid;
      if (!uid) return res.status(401).json({ error: "Unauthorized" });
      return res.status(200).json({
        pensionPasses: await this.service.getPensionPassesByUsuario(uid),
      });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  precontractPensionPass = async (req: Request, res: Response) => {
    try {
      const uid = (req as AuthenticatedRequest).uid;
      if (!uid) return res.status(401).json({ error: "Unauthorized" });
      const pensionId = String((req.body as { pensionId?: unknown }).pensionId ?? "");
      const contractMonths = Number((req.body as { contractMonths?: unknown }).contractMonths ?? 1);
      if (!pensionId) return res.status(400).json({ error: "'pensionId' es requerido" });
      return res.status(200).json({
        pensionPass: await this.service.precontractPensionPass(uid, pensionId, contractMonths),
      });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  renewPensionPass = async (req: Request, res: Response) => {
    try {
      const uid = (req as AuthenticatedRequest).uid;
      if (!uid) return res.status(401).json({ error: "Unauthorized" });
      const contractMonths = Number((req.body as { contractMonths?: unknown }).contractMonths ?? 1);
      return res.status(200).json({
        pensionPass: await this.service.renewPensionPass(uid, String(req.params.id), contractMonths),
      });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  contractPensionPass = async (req: Request, res: Response) => {
    try {
      const uid = (req as AuthenticatedRequest).uid;
      if (!uid) return res.status(401).json({ error: "Unauthorized" });
      return res.status(200).json({
        pensionPass: await this.service.contractPensionPass(uid, String(req.params.id)),
      });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  updatePensionPass = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const currentProject = await this.service.getProyectoIdByPensionPassId(id);
      if (!canAccessProjectFromRequest(req, currentProject)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const [error, dto] = UpdatePensionPassDto.create(req.body);
      if (error || !dto) return res.status(400).json({ error });
      if (dto.pension) {
        const nextProject = await this.service.getProyectoIdByPensionId(dto.pension);
        if (!canAccessProjectFromRequest(req, nextProject)) {
          return res.status(403).json({ error: "Forbidden" });
        }
      }
      const pensionPass = await this.service.updatePensionPass(id, {
        name: dto.name,
        pension: dto.pension,
        idPass: dto.idPass,
        vigent: dto.vigent,
        created: dto.created,
        from: dto.from,
        to: dto.to,
        estado: dto.estado,
        usuario: dto.usuario,
      });
      return res.status(200).json({ pensionPass });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  updatePensionPassStatus = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const projectId = await this.service.getProyectoIdByPensionPassId(id);
      if (!canAccessProjectFromRequest(req, projectId)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const { estado } = req.body as { estado?: unknown };
      if (typeof estado !== "boolean") {
        return res.status(400).json({ error: "'estado' debe ser boolean" });
      }
      return res.status(200).json({
        pensionPass: await this.service.updatePensionPassStatus(id, estado),
      });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  deletePensionPass = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const projectId = await this.service.getProyectoIdByPensionPassId(id);
      if (!canAccessProjectFromRequest(req, projectId)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      return res.status(200).json({ pensionPass: await this.service.deletePensionPass(id) });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };
}
