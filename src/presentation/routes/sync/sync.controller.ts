import { Request, Response } from "express";
import { ModuloModel } from "../../../data/mongo/models/parking/modulo.schema";
import { ProyectoModel } from "../../../data/mongo/models/parking/proyecto.schema";
import { PensionPassModel } from "../../../data/mongo/models/pension/pension-pass.schema";
import { PensionModel } from "../../../data/mongo/models/pension/pension.schema";
import { InboxEventModel } from "../../../data/mongo/models/sync/inbox-event.schema";
import { SyncRequest } from "../../middlewares/sync-auth.middleware";
import { ErrorService } from "../../services/error.service";

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
