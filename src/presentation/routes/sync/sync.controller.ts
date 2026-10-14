import { Request, Response } from "express";
import { isUserAppAccess } from "../../../domain/constants";
import { SyncRequest } from "../../middlewares/sync-auth.middleware";
import { ErrorService } from "../../services/error.service";
import { SyncService } from "../../services/sync/sync.service";
import { UniqueConstraintError } from "../../../domain/errors/unique-constraint.error";
import type { MobileOperationRepository } from "../../../domain/repositories/mobile/mobile-operation.repository";
import type { InstallationsRepository } from "../../../domain/repositories/installations/installations.repository";
import { OperationalIncidentService } from "../../services/incidents/operational-incident.service";

const processingTimeoutMs = 60_000;
const backoffMs = [0, 30_000, 120_000, 300_000, 900_000];

const getNextRetryAt = (attempts: number, now: number) => {
  const delay = backoffMs[Math.min(Math.max(attempts, 0), backoffMs.length - 1)];
  return now + delay;
};

export class SyncController {
  constructor(
    private readonly service: SyncService,
    private readonly operations: MobileOperationRepository,
    private readonly installations: InstallationsRepository,
  ) {}

  status = async (req: Request, res: Response) => {
    return res.status(200).json({
      service: "viggo-administrativo-sync",
      installationId: (req as SyncRequest).installationId,
      status: "ok",
      serverTime: Date.now(),
    });
  };

  claimNextMobileCommand = async (req: Request, res: Response) => {
    try {
      const installationId = (req as SyncRequest).installationId!;
      const now = Date.now();
      const staleBefore = now - processingTimeoutMs;
      await this.installations.recordCommandPoll(installationId, now);
      await OperationalIncidentService.resolve(`installation-offline:${installationId}`);
      await this.operations.expireOverdue(installationId, now);
      const deadLetters = await this.operations.findRecentDeadLetters(installationId, now - 5_000);
      await Promise.all(deadLetters.map((operation) =>
        OperationalIncidentService.open({
          incidentKey: `mobile-operation-dead-letter:${operation.operationId}`,
          type: "MOBILE_OPERATION_DEAD_LETTER",
          severity: operation.type === "APPLY_TICKET_PAYMENT" ? "critical" : "warning",
          source: "admin-sync",
          projectId: String(operation.proyectoId ?? ""),
          installationId: String(operation.installationId ?? ""),
          operationId: String(operation.operationId ?? ""),
          message: `Operacion movil en dead_letter: ${operation.type}`,
          metadata: {
            type: operation.type,
            attempts: operation.attempts,
            maxAttempts: operation.maxAttempts,
            error: operation.error,
          },
        }),
      ));
      await this.operations.releaseStaleProcessing(installationId, staleBefore, now);
      await this.operations.moveExhaustedToDeadLetter(installationId, now);
      const operation = await this.operations.claimNext(installationId, now, processingTimeoutMs);
      if (!operation) return res.status(204).send();
      return res.status(200).json({ operation });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  completeMobileCommand = async (req: Request, res: Response) => {
    try {
      const installationId = (req as SyncRequest).installationId!;
      const operationId = String(req.params.operationId ?? "").trim();
      const now = Date.now();
      const success = req.body?.success === true;
      const current = await this.operations.findForCompletion(operationId, installationId);
      if (!current) return res.status(404).json({ error: "Operacion no encontrada" });
      if (current.status === "completed") {
        return res.status(200).json({ operation: current });
      }
      const attempts = Number(current.attempts ?? 0);
      const maxAttempts = Number(current.maxAttempts ?? 5);
      const retryable = !success && attempts < maxAttempts;
      const operation = await this.operations.complete(operationId, installationId, {
        status: success ? "completed" : retryable ? "failed" : "dead_letter",
        result: success && req.body?.result && typeof req.body.result === "object"
          ? req.body.result
          : undefined,
        error: success ? "" : String(req.body?.error ?? "No se pudo ejecutar la operacion"),
        nextRetryAt: retryable ? getNextRetryAt(attempts, now) : undefined,
        completedAt: success || !retryable ? now : undefined,
        updatedAt: now,
      });
      if (!operation) return res.status(404).json({ error: "Operacion no encontrada" });
      return res.status(200).json({ operation });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getConfiguration = async (req: Request, res: Response) => {
    try {
      const result = await this.service.getConfiguration(
        String(req.params.proyectoId),
      );

      if (!result) {
        return res.status(404).json({
          error: "Proyecto no encontrado",
        });
      }

      return res.status(200).json(result);
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getProjectsCatalog = async (_req: Request, res: Response) => {
    try {
      const proyectos = await this.service.getProjectsCatalog();

      return res.status(200).json({
        proyectos,
      });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getAccessSnapshot = async (req: Request, res: Response) => {
    try {
      const result = await this.service.getAccessSnapshot(
        String(req.params.proyectoId),
      );

      if (!result) {
        return res.status(404).json({
          error: "Proyecto no encontrado",
        });
      }

      return res.status(200).json(result);
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getAccessUserByCorreo = async (req: Request, res: Response) => {
    try {
      const correo = String(req.params.correo ?? "")
        .trim()
        .toLowerCase();

      const app = String(req.query.app ?? "").trim();

      if (!correo) {
        return res.status(400).json({
          error: "correo es requerido",
        });
      }

      if (!isUserAppAccess(app)) {
        return res.status(400).json({
          error: "app es requerida y debe ser una aplicación válida",
        });
      }

      const access = await this.service.getAccessUserByCorreo(correo, app);

      if (!access) {
        return res.status(404).json({
          error:
            "Usuario no encontrado o sin acceso válido a la aplicación solicitada",
        });
      }

      return res.status(200).json({
        ...access,
      });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getAccessUserByTelefono = async (req: Request, res: Response) => {
    try {
      const telefono = String(req.params.telefono ?? "").trim();
      const app = String(req.query.app ?? "").trim();

      if (!telefono) {
        return res.status(400).json({
          error: "telefono es requerido",
        });
      }

      if (!isUserAppAccess(app)) {
        return res.status(400).json({
          error: "app es requerida y debe ser una aplicación válida",
        });
      }

      const access = await this.service.getAccessUserByTelefono(telefono, app);

      if (!access) {
        return res.status(404).json({
          error:
            "Usuario no encontrado o sin acceso válido a la aplicación solicitada",
        });
      }

      return res.status(200).json({
        ...access,
      });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  requestInstallationLink = async (req: Request, res: Response) => {
    try {
      const installationId = (req as SyncRequest).installationId!;
      const body = req.body as Record<string, unknown>;

      const proyectoId = String(body.proyectoId ?? "").trim();
      const installationLinkToken = String(
        body.installationLinkToken ?? "",
      ).trim();

      const browserCoordinatesRaw = Array.isArray(body.browserCoordinates)
        ? body.browserCoordinates
        : [];

      const browserLongitude = Number(browserCoordinatesRaw[0]);
      const browserLatitude = Number(browserCoordinatesRaw[1]);

      const browserCoordinates =
        browserCoordinatesRaw.length === 2 &&
        Number.isFinite(browserLongitude) &&
        Number.isFinite(browserLatitude)
          ? ([browserLongitude, browserLatitude] as [number, number])
          : undefined;

      const browserLocationAccuracy = Number(body.browserLocationAccuracy);

      const browserLocationCapturedAt = Number(body.browserLocationCapturedAt);

      if (!proyectoId) {
        return res.status(400).json({
          error: "proyectoId es requerido",
        });
      }

      if (!installationLinkToken) {
        return res.status(400).json({
          error: "Token de vinculacion requerido",
        });
      }

      const result = await this.service.requestInstallationLink({
        installationId,
        proyectoId,
        installationLinkToken,
        localApiBaseUrl: String(body.localApiBaseUrl ?? ""),
        serverIp: String(body.serverIp ?? ""),
        serverMac: String(body.serverMac ?? ""),
        browserCoordinates,
        browserLocationAccuracy: Number.isFinite(browserLocationAccuracy)
          ? browserLocationAccuracy
          : undefined,
        browserLocationCapturedAt: Number.isFinite(browserLocationCapturedAt)
          ? browserLocationCapturedAt
          : undefined,
        requestedByUserId: String(body.requestedByUserId ?? ""),
        requestedByUserName: String(body.requestedByUserName ?? ""),
      });

      if (result.status === "missing-project") {
        return res.status(404).json({
          error: "Proyecto no encontrado",
        });
      }

      if (result.status === "missing-token") {
        return res.status(409).json({
          error: "El proyecto no tiene token de vinculacion generado",
        });
      }

      if (result.status === "invalid-token") {
        return res.status(403).json({
          error: "Token de vinculacion invalido",
        });
      }

      if (result.status === "already-approved-other-project") {
        return res.status(409).json({
          error: "Esta instalacion ya fue aprobada para otro proyecto",
          request: result.request,
        });
      }

      return res.status(202).json({
        request: result.request,
      });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getInstallationRequestStatus = async (req: Request, res: Response) => {
    try {
      const installationId = (req as SyncRequest).installationId!;

      const result =
        await this.service.getInstallationRequestStatus(installationId);

      return res.status(200).json(result);
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  receiveHeartbeatSnapshot = async (req: Request, res: Response) => {
    try {
      const installationId = (req as SyncRequest).installationId!;
      const body = req.body as Record<string, unknown>;

      const proyectoId = String(body.proyectoId ?? "").trim();
      const generatedAt = Number(body.generatedAt);
      const source =
        String(body.source ?? "operativo-sync").trim() || "operativo-sync";

      const summary =
        body.summary && typeof body.summary === "object"
          ? (body.summary as Record<string, unknown>)
          : null;

      const modules = Array.isArray(body.modules)
        ? body.modules.filter(
            (item): item is Record<string, unknown> =>
              Boolean(item) && typeof item === "object" && !Array.isArray(item),
          )
        : null;

      const metadata =
        body.metadata &&
        typeof body.metadata === "object" &&
        !Array.isArray(body.metadata)
          ? (body.metadata as Record<string, unknown>)
          : undefined;

      if (!proyectoId) {
        return res.status(400).json({
          error: "proyectoId es requerido",
        });
      }

      if (!Number.isFinite(generatedAt)) {
        return res.status(400).json({
          error: "generatedAt debe ser numerico",
        });
      }

      if (!summary) {
        return res.status(400).json({
          error: "summary es requerido",
        });
      }

      if (!modules) {
        return res.status(400).json({
          error: "modules debe ser un arreglo",
        });
      }

      const result = await this.service.receiveHeartbeatSnapshot({
        installationId,
        proyectoId,
        generatedAt,
        source,
        summary,
        modules,
        metadata,
      });

      return res.status(202).json(result);
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  receiveEvent = async (req: Request, res: Response) => {
    try {
      const installationId = (req as SyncRequest).installationId!;
      const body = req.body as Record<string, unknown>;

      const eventId = String(body.eventId ?? "").trim();
      const proyectoId = String(body.proyectoId ?? "").trim();
      const eventType = String(body.eventType ?? "").trim();
      const aggregateId = String(body.aggregateId ?? "").trim();
      const occurredAt = Number(body.occurredAt);
      const payload = body.payload;

      if (!eventId || !proyectoId || !eventType || !aggregateId) {
        return res.status(400).json({
          error: "eventId, proyectoId, eventType y aggregateId son requeridos",
        });
      }

      if (!Number.isFinite(occurredAt)) {
        return res.status(400).json({
          error: "occurredAt debe ser numerico",
        });
      }

      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return res.status(400).json({
          error: "payload debe ser un objeto",
        });
      }

      const result = await this.service.receiveEvent({
        eventId,
        installationId,
        proyectoId,
        eventType,
        aggregateId,
        occurredAt,
        sourcePosition: body.sourcePosition === undefined ? undefined : String(body.sourcePosition),
        payload,
      });

      return res.status(result.duplicate ? 200 : 202).json(result);
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        return res.status(200).json({
          accepted: true,
          duplicate: true,
        });
      }

      return ErrorService.handleApiError(error, res);
    }
  };
}
