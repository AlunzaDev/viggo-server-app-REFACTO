import { Request, Response } from "express";
import { MobileOperationModel } from "../../../data/mongo";
import { ErrorService } from "../../services/error.service";
import { OperationalIncidentService } from "../../services/incidents/operational-incident.service";

const validStatuses = new Set(["pending", "processing", "completed", "failed", "expired", "dead_letter"]);

export class MobileOperationAdminController {
  list = async (req: Request, res: Response) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
      const status = String(req.query.status ?? "dead_letter").trim();
      const type = String(req.query.type ?? "").trim();
      const proyectoId = String(req.query.proyectoId ?? "").trim();
      const installationId = String(req.query.installationId ?? "").trim();
      if (status && !validStatuses.has(status)) {
        return res.status(400).json({ error: "status invalido" });
      }
      const filter = {
        ...(status ? { status } : {}),
        ...(type ? { type } : {}),
        ...(proyectoId ? { proyectoId } : {}),
        ...(installationId ? { installationId } : {}),
      };
      const [total, operations] = await Promise.all([
        MobileOperationModel.countDocuments(filter),
        MobileOperationModel.find(filter)
          .sort({ updatedAt: -1, createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
      ]);
      if (status === "dead_letter") {
        await Promise.all(operations.map((operation) =>
          OperationalIncidentService.open({
            incidentKey: `mobile-operation-dead-letter:${operation.operationId}`,
            type: "MOBILE_OPERATION_DEAD_LETTER",
            severity: operation.type === "APPLY_TICKET_PAYMENT" ? "critical" : "warning",
            source: "admin-mobile-operations",
            projectId: String(operation.proyectoId ?? ""),
            installationId: String(operation.installationId ?? ""),
            operationId: String(operation.operationId ?? ""),
            message: `Operacion movil en dead_letter: ${operation.type}`,
            metadata: {
              attempts: operation.attempts,
              maxAttempts: operation.maxAttempts,
              error: operation.error,
            },
          }),
        ));
      }
      return res.status(200).json({
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        operations,
      });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  reactivate = async (req: Request, res: Response) => {
    try {
      const operationId = String(req.params.operationId ?? "").trim();
      const now = Date.now();
      const operation = await MobileOperationModel.findOneAndUpdate(
        {
          operationId,
          status: { $in: ["dead_letter", "failed", "expired"] },
        },
        {
          $set: {
            status: "pending",
            error: "",
            nextRetryAt: now,
            processingDeadlineAt: undefined,
            completedAt: undefined,
            updatedAt: now,
          },
        },
        { new: true },
      ).lean();
      if (!operation) {
        return res.status(404).json({ error: "Operacion no encontrada o no reactivable" });
      }
      await OperationalIncidentService.resolve(`mobile-operation-dead-letter:${operation.operationId}`);
      return res.status(200).json({ operation });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };
}
