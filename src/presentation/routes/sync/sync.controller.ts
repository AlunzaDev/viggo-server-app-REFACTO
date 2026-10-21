import type { Request, Response } from "express";
import {
  AccessUserLookupDto,
  HeartbeatSnapshotDto,
  InstallationLinkRequestDto,
  SyncEventDto,
} from "../../../domain/dtos/sync/sync.dto";
import { UniqueConstraintError } from "../../../domain/errors/unique-constraint.error";
import type { InstallationsRepository } from "../../../domain/repositories/installations/installations.repository";
import { isOwnProject, type SyncRequest } from "../../middlewares/sync-auth.middleware";
import { ErrorService } from "../../services/error.service";
import type { MobileCommandService } from "../../services/sync/mobile-command.service";
import type { SyncService } from "../../services/sync/sync.service";

const otherProject = (res: Response) =>
  res.status(403).json({ error: "El proyecto no pertenece a esta instalacion", code: "SYNC_PROJECT_MISMATCH" });

const installationOf = (req: Request) => (req as SyncRequest).installationId!;

/** HTTP for an installation's OPERATIVO; the installation comes from its sync credentials. */
export class SyncController {
  constructor(
    private readonly service: SyncService,
    private readonly commands: MobileCommandService,
    private readonly installations: InstallationsRepository,
  ) {}

  status = async (req: Request, res: Response) => {
    return res.status(200).json({
      service: "viggo-administrativo-sync",
      installationId: installationOf(req),
      status: "ok",
      serverTime: Date.now(),
    });
  };

  /**
   * Issues the installation a new sync token (it asks when told to rotate). The token it
   * used stays valid until the new one is used, so a lost answer can simply be retried.
   */
  rotateSyncToken = async (req: Request, res: Response) => {
    try {
      const rotated = await this.installations.rotateSyncToken(installationOf(req), (req as SyncRequest).syncTokenHash!);
      if (!rotated) return res.status(401).json({ error: "Invalid installation token" });
      return res.status(200).json({ syncToken: rotated.syncToken });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  claimNextMobileCommand = async (req: Request, res: Response) => {
    try {
      const operation = await this.commands.claimNext(installationOf(req));
      if (!operation) return res.status(204).send();
      return res.status(200).json({ operation });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  completeMobileCommand = async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const success = body.success === true;
      const operation = await this.commands.complete(installationOf(req), String(req.params.operationId ?? "").trim(), {
        success,
        result: success && body.result && typeof body.result === "object" ? body.result as Record<string, unknown> : undefined,
        error: body.error === undefined || body.error === null ? undefined : String(body.error),
      });
      return res.status(200).json({ operation });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getConfiguration = async (req: Request, res: Response) => {
    try {
      const proyectoId = String(req.params.proyectoId);
      if (!isOwnProject(req, proyectoId)) return otherProject(res);
      const result = await this.service.getConfiguration(proyectoId);
      if (!result) return res.status(404).json({ error: "Proyecto no encontrado" });
      return res.status(200).json(result);
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getAccessSnapshot = async (req: Request, res: Response) => {
    try {
      const proyectoId = String(req.params.proyectoId);
      if (!isOwnProject(req, proyectoId)) return otherProject(res);
      const result = await this.service.getAccessSnapshot(proyectoId);
      if (!result) return res.status(404).json({ error: "Proyecto no encontrado" });
      return res.status(200).json(result);
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getAccessUserByCorreo = (req: Request, res: Response) => this.accessUser("correo", req, res);

  getAccessUserByTelefono = (req: Request, res: Response) => this.accessUser("telefono", req, res);

  private async accessUser(field: "correo" | "telefono", req: Request, res: Response) {
    try {
      const [error, dto] = AccessUserLookupDto.create(field, req.params[field], req.query.app);
      if (error || !dto) return res.status(400).json({ error });
      const proyectoId = (req as SyncRequest).proyectoId!;
      const access = field === "correo"
        ? await this.service.getAccessUserByCorreo(dto.value, dto.app, proyectoId)
        : await this.service.getAccessUserByTelefono(dto.value, dto.app, proyectoId);
      if (!access) return res.status(404).json({ error: "Usuario no encontrado o sin acceso válido a la aplicación solicitada" });
      return res.status(200).json({ ...access });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  }

  /** Project the link token belongs to, so the operator can confirm before linking. */
  previewInstallationLink = async (req: Request, res: Response) => {
    return res.status(200).json({ proyecto: (req as SyncRequest).linkProject });
  };

  requestInstallationLink = async (req: Request, res: Response) => {
    try {
      const dto = InstallationLinkRequestDto.create(req.body as Record<string, unknown>);
      const result = await this.service.requestInstallationLink({
        ...dto.values, installationId: installationOf(req), proyectoId: (req as SyncRequest).proyectoId!,
      });
      if (result.status === "missing-project") return res.status(404).json({ error: "Proyecto no encontrado" });
      if (result.status === "already-approved-other-project") {
        return res.status(409).json({ error: "Esta instalacion ya fue aprobada para otro proyecto", request: result.request });
      }
      return res.status(202).json({ request: result.request });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getInstallationRequestStatus = async (req: Request, res: Response) => {
    try {
      return res.status(200).json(await this.service.getInstallationRequestStatus(installationOf(req), (req as SyncRequest).proyectoId!));
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  receiveHeartbeatSnapshot = async (req: Request, res: Response) => {
    try {
      const [error, dto] = HeartbeatSnapshotDto.create(req.body as Record<string, unknown>);
      if (error || !dto) return res.status(400).json({ error });
      if (!isOwnProject(req, dto.values.proyectoId)) return otherProject(res);
      return res.status(202).json(await this.service.receiveHeartbeatSnapshot({ ...dto.values, installationId: installationOf(req) }));
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  receiveEvent = async (req: Request, res: Response) => {
    try {
      const [error, dto] = SyncEventDto.create(req.body as Record<string, unknown>);
      if (error || !dto) return res.status(400).json({ error });
      if (!isOwnProject(req, dto.values.proyectoId)) return otherProject(res);
      const result = await this.service.receiveEvent({ ...dto.values, installationId: installationOf(req) });
      return res.status(result.duplicate ? 200 : 202).json(result);
    } catch (error) {
      // The same event twice at once: the second is a duplicate, not an error.
      if (error instanceof UniqueConstraintError) return res.status(200).json({ accepted: true, duplicate: true });
      return ErrorService.handleApiError(error, res);
    }
  };
}
