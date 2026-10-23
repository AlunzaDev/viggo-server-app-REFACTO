import { Request, Response } from "express";
import { CustomError } from "../../../domain/errors/custom.error";
import { getAuthenticatedRequestUser, projectAccessFromRequest } from "../../middlewares/auth.middleware";
import { ErrorService } from "../../services/error.service";
import type { PushNoticeService } from "../../services/push/push-notice.service";

const userId = (req: Request) => {
  const id = getAuthenticatedRequestUser(req)?.id;
  if (!id) throw CustomError.unauthorized("Unauthorized");
  return String(id);
};

export class PushController {
  constructor(private readonly service: PushNoticeService) {}

  config = (_req: Request, res: Response) => res.status(200).json(this.service.config());

  subscribe = async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      return res.status(201).json(await this.service.subscribe(userId(req), body, String(req.get("user-agent") ?? "")));
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  unsubscribe = async (req: Request, res: Response) => {
    try {
      return res.status(200).json(await this.service.unsubscribe(userId(req), (req.body ?? {}) as Record<string, unknown>));
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  preferences = async (req: Request, res: Response) => {
    try {
      return res.status(200).json(await this.service.preferences(userId(req), projectAccessFromRequest(req)));
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  setPreference = async (req: Request, res: Response) => {
    try {
      const proyectoId = String(req.params.proyectoId ?? "").trim();
      const body = (req.body ?? {}) as Record<string, unknown>;
      return res.status(200).json(await this.service.setPreference(userId(req), proyectoId, body.activo, projectAccessFromRequest(req)));
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };
}
