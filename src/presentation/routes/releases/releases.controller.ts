import { Request, Response } from "express";
import { getAuthenticatedRequestUser } from "../../middlewares/auth.middleware";
import type { SyncRequest } from "../../middlewares/sync-auth.middleware";
import { ErrorService } from "../../services/error.service";
import type { ReleasesService } from "../../services/releases/releases.service";

const userId = (req: Request) => {
  const id = getAuthenticatedRequestUser(req)?.id;
  return id ? String(id) : null;
};

export class ReleasesController {
  constructor(private readonly service: ReleasesService) {}

  catalog = async (_req: Request, res: Response) => {
    try {
      return res.status(200).json(await this.service.catalog());
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  addPackage = async (req: Request, res: Response) => {
    try {
      return res.status(201).json(await this.service.addPackage((req.body ?? {}) as Record<string, unknown>, userId(req)));
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  setChannel = async (req: Request, res: Response) => {
    try {
      const component = String(req.params.component ?? "");
      return res.status(200).json(await this.service.setChannel(component, (req.body ?? {}) as Record<string, unknown>, userId(req)));
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  status = async (_req: Request, res: Response) => {
    try {
      return res.status(200).json(await this.service.status());
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  /** GET /api/sync/releases: authenticated by the installation's sync token. */
  desiredForInstallation = async (req: Request, res: Response) => {
    try {
      const sync = req as SyncRequest;
      return res.status(200).json(await this.service.desiredForInstallation(sync.installationId!, sync.proyectoId!, req.query.plataforma));
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };
}
