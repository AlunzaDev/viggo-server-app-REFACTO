import { Request, Response } from "express";
import { OperationalIncidentModel } from "../../../data/mongo";
import { ErrorService } from "../../services/error.service";
import { OperationalIncidentService } from "../../services/incidents/operational-incident.service";

const statuses = new Set(["open", "resolved"]);
const severities = new Set(["info", "warning", "critical"]);

export class OperationalIncidentController {
  list = async (req: Request, res: Response) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
      const status = String(req.query.status ?? "open").trim();
      const severity = String(req.query.severity ?? "").trim();
      const type = String(req.query.type ?? "").trim();
      const projectId = String(req.query.projectId ?? "").trim();
      const installationId = String(req.query.installationId ?? "").trim();
      if (status && !statuses.has(status)) return res.status(400).json({ error: "status invalido" });
      if (severity && !severities.has(severity)) return res.status(400).json({ error: "severity invalida" });
      const filter = {
        ...(status ? { status } : {}),
        ...(severity ? { severity } : {}),
        ...(type ? { type } : {}),
        ...(projectId ? { projectId } : {}),
        ...(installationId ? { installationId } : {}),
      };
      const [total, incidents] = await Promise.all([
        OperationalIncidentModel.countDocuments(filter),
        OperationalIncidentModel.find(filter)
          .sort({ lastSeenAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit),
      ]);
      return res.status(200).json({
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        incidents: incidents.map((incident) => incident.toJSON()),
      });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  resolve = async (req: Request, res: Response) => {
    try {
      const incidentKey = String(req.params.incidentKey ?? "").trim();
      const incident = await OperationalIncidentService.resolve(incidentKey);
      if (!incident) return res.status(404).json({ error: "Incidente no encontrado o ya resuelto" });
      return res.status(200).json({ incident: incident.toJSON() });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };
}
