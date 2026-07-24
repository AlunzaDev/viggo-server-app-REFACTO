import { Request, Response } from "express";
import { createHash } from "node:crypto";
import { PermissionProfileModel } from "../../../data/mongo/models/auth/permission-profile.schema";
import { UsuarioModel } from "../../../data/mongo/models/auth/usuario.schema";
import { ModuloModel } from "../../../data/mongo/models/parking/modulo.schema";
import { ProyectoModel } from "../../../data/mongo/models/parking/proyecto.schema";
import { PensionPassModel } from "../../../data/mongo/models/pension/pension-pass.schema";
import { PensionModel } from "../../../data/mongo/models/pension/pension.schema";
import { InboxEventModel } from "../../../data/mongo/models/sync/inbox-event.schema";
import { LocalInstallationRequestModel } from "../../../data/mongo/models/system/local-installation-request.schema";
import { SyncRequest } from "../../middlewares/sync-auth.middleware";
import { ErrorService } from "../../services/error.service";

const hashInstallationToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export class SyncController {
  status = async (req: Request, res: Response) => {
    return res.status(200).json({
      service: "viggo-nubeadmin-sync",
      installationId: (req as SyncRequest).installationId,
      status: "ok",
      serverTime: Date.now(),
    });
  };

  getConfiguration = async (req: Request, res: Response) => {
    try {
      const proyectoId = String(req.params.proyectoId);
      const proyecto = await ProyectoModel.findById(proyectoId).lean();
      if (!proyecto) return res.status(404).json({ error: "Proyecto no encontrado" });

      const [modulos, pensiones] = await Promise.all([
        ModuloModel.find({ proyecto: proyectoId })
          .select("nombre proyecto tipo estado identificador descripcion")
          .lean(),
        PensionModel.find({ proyecto: proyectoId }).lean(),
      ]);
      const pensionIds = pensiones.map((item) => String(item._id));
      const pensionPasses = await PensionPassModel.find({ pension: { $in: pensionIds } })
        .select("usuario name pension idPass vigent created from to estado antiPassback")
        .lean();

      return res.status(200).json({
        version: Date.now(),
        proyecto,
        modulos,
        pensiones,
        pensionPasses,
      });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getProjectsCatalog = async (_req: Request, res: Response) => {
    try {
      const proyectos = await ProyectoModel.find({ estado: true })
        .select(
          "nombre ciudad identificador codigoProyecto serverIp serverMac localApiBaseUrl img descripcion estado coordinates",
        )
        .sort({ nombre: 1 })
        .lean();

      return res.status(200).json({ proyectos });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getAccessSnapshot = async (req: Request, res: Response) => {
    try {
      const proyectoId = String(req.params.proyectoId);
      const proyecto = await ProyectoModel.findById(proyectoId).lean();
      if (!proyecto) return res.status(404).json({ error: "Proyecto no encontrado" });

      const users = await UsuarioModel.find({
        $or: [{ parkings: proyectoId }, { rol: "SUPER_ROLE" }],
      })
        .select(
          "nombre apellido correo telefono coordinates password emailValidated rol parkings permissionProfileId modules nacimiento img estado google",
        )
        .lean();

      const profileIds = [
        ...new Set(
          users
            .map((user) => user.permissionProfileId)
            .filter((profileId): profileId is string => typeof profileId === "string"),
        ),
      ];
      const permissionProfiles = profileIds.length
        ? await PermissionProfileModel.find({ _id: { $in: profileIds } }).lean()
        : [];

      return res.status(200).json({
        version: Date.now(),
        proyectoId,
        users,
        permissionProfiles,
      });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getAccessUserByCorreo = async (req: Request, res: Response) => {
    try {
      const correo = String(req.params.correo ?? "").trim().toLowerCase();
      if (!correo) return res.status(400).json({ error: "correo es requerido" });

      const user = await UsuarioModel.findOne({ correo })
        .select(
          "nombre apellido correo telefono coordinates password emailValidated rol parkings permissionProfileId modules nacimiento img estado google",
        )
        .lean();
      if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

      return res.status(200).json({ user });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getAccessUserByTelefono = async (req: Request, res: Response) => {
    try {
      const telefono = String(req.params.telefono ?? "").trim();
      if (!telefono) return res.status(400).json({ error: "telefono es requerido" });

      const user = await UsuarioModel.findOne({ telefono })
        .select(
          "nombre apellido correo telefono coordinates password emailValidated rol parkings permissionProfileId modules nacimiento img estado google",
        )
        .lean();
      if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

      return res.status(200).json({ user });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  requestInstallationLink = async (req: Request, res: Response) => {
    try {
      const installationId = (req as SyncRequest).installationId!;
      const body = req.body as Record<string, unknown>;
      const proyectoId = String(body.proyectoId ?? "").trim();
      const installationLinkToken = String(body.installationLinkToken ?? "").trim();
      if (!proyectoId) return res.status(400).json({ error: "proyectoId es requerido" });
      if (!installationLinkToken) {
        return res.status(400).json({ error: "Token de vinculacion requerido" });
      }

      const proyecto = await ProyectoModel.findById(proyectoId).lean();
      if (!proyecto) return res.status(404).json({ error: "Proyecto no encontrado" });
      const expectedTokenHash = String(proyecto.installationLinkTokenHash ?? "").trim();
      if (!expectedTokenHash) {
        return res.status(409).json({
          error: "El proyecto no tiene token de vinculacion generado",
        });
      }
      if (hashInstallationToken(installationLinkToken) !== expectedTokenHash) {
        return res.status(403).json({ error: "Token de vinculacion invalido" });
      }

      const existing = await LocalInstallationRequestModel.findOne({ installationId }).lean();
      if (existing?.status === "approved" && existing.proyectoId !== proyectoId) {
        return res.status(409).json({
          error: "Esta instalacion ya fue aprobada para otro proyecto",
          request: existing,
        });
      }

      const now = Date.now();
      const request = await LocalInstallationRequestModel.findOneAndUpdate(
        { installationId },
        {
          installationId,
          proyectoId,
          proyectoNombre: String(proyecto.nombre ?? ""),
          proyectoIdentificador: String(proyecto.identificador ?? ""),
          localApiBaseUrl: String(body.localApiBaseUrl ?? ""),
          serverIp: String(body.serverIp ?? ""),
          serverMac: String(body.serverMac ?? ""),
          status: existing?.status === "approved" ? "approved" : "pending",
          requestedByUserId: String(body.requestedByUserId ?? ""),
          requestedByUserName: String(body.requestedByUserName ?? ""),
          requestedAt: existing?.status === "pending" ? existing.requestedAt : Date.now(),
          reviewedByUserId: existing?.status === "approved" ? existing.reviewedByUserId : "",
          reviewedByUserName: existing?.status === "approved" ? existing.reviewedByUserName : "",
          reviewedAt: existing?.status === "approved" ? existing.reviewedAt : undefined,
          reviewNote: existing?.status === "approved" ? existing.reviewNote : "",
          updatedAt: now,
        },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      ).lean();

      return res.status(202).json({ request });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getInstallationRequestStatus = async (req: Request, res: Response) => {
    try {
      const installationId = (req as SyncRequest).installationId!;
      const requestDocument = await LocalInstallationRequestModel.findOne({ installationId });
      const request = requestDocument?.toObject();
      const proyecto =
        request?.status === "approved"
          ? await ProyectoModel.findById(request.proyectoId).lean()
          : null;

      return res.status(200).json({
        request,
        proyecto,
        oneTimeSyncToken: null,
      });
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
        return res.status(400).json({ error: "occurredAt debe ser numerico" });
      }
      if (!payload || typeof payload !== "object") {
        return res.status(400).json({ error: "payload debe ser un objeto" });
      }

      const existing = await InboxEventModel.findOne({ eventId }).lean();
      if (existing) {
        return res.status(200).json({ accepted: true, duplicate: true, eventId });
      }

      await InboxEventModel.create({
        eventId,
        installationId,
        proyectoId,
        eventType,
        aggregateId,
        occurredAt,
        payload,
      });

      return res.status(202).json({ accepted: true, duplicate: false, eventId });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        return res.status(200).json({ accepted: true, duplicate: true });
      }
      return ErrorService.handleApiError(error, res);
    }
  };
}
