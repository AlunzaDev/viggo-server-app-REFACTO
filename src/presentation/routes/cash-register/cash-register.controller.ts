import { Request, Response } from "express";
import {
  getAllowedProjectIdsFromRequest,
  getAuthenticatedRequestUser,
  isSuperAdminRequest,
} from "../../middlewares";
import { ErrorService } from "../../services/error.service";
import {
  CashRegisterActorContext,
  CashRegisterService,
} from "../../services/cash-register/cash-register.service";

type AuthenticatedRequest = Request & { uid?: string };

export class CashRegisterController {
  constructor(private readonly cashRegisterService: CashRegisterService) {}

  openShift = async (req: Request, res: Response) => {
    try {
      const { moduloId, openingAmount, notes } = req.body as {
        moduloId?: unknown;
        openingAmount?: unknown;
        notes?: unknown;
      };

      if (typeof moduloId !== "string" || moduloId.trim().length === 0) {
        return res.status(400).json({ error: "'moduloId' es requerido" });
      }

      if (typeof openingAmount !== "number") {
        return res.status(400).json({ error: "'openingAmount' debe ser numerico" });
      }

      const result = await this.cashRegisterService.openShift(
        {
          moduloId: moduloId.trim(),
          openingAmount,
          notes: typeof notes === "string" ? notes : undefined,
        },
        this.buildActorContext(req),
      );

      return res.status(201).json(result);
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getActiveShiftByModulo = async (req: Request, res: Response) => {
    try {
      const moduloId = String(req.params.moduloId);
      const detail = await this.cashRegisterService.getActiveShiftByModulo(
        moduloId,
        this.buildActorContext(req),
      );

      return res.status(200).json({ detail });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  listShifts = async (req: Request, res: Response) => {
    try {
      const { moduloId, status, dateFrom, dateTo, page, limit, includeSummary } =
        req.query as {
        moduloId?: string;
        status?: string;
        dateFrom?: string;
        dateTo?: string;
        page?: string;
        limit?: string;
        includeSummary?: string;
      };

      const filters = {
        moduloId: moduloId?.trim() || undefined,
        status: status?.trim() || undefined,
        dateFrom: dateFrom ? Number(dateFrom) : undefined,
        dateTo: dateTo ? Number(dateTo) : undefined,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
      };

      const actor = this.buildActorContext(req);
      const result =
        includeSummary === "true"
          ? await this.cashRegisterService.listShiftSummaries(filters, actor)
          : await this.cashRegisterService.listShifts(filters, actor);

      return res.status(200).json(result);
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getShiftsSummary = async (req: Request, res: Response) => {
    try {
      const { moduloId, status, dateFrom, dateTo } = req.query as {
        moduloId?: string;
        status?: string;
        dateFrom?: string;
        dateTo?: string;
      };

      const result = await this.cashRegisterService.getShiftsSummary(
        {
          moduloId: moduloId?.trim() || undefined,
          status: status?.trim() || undefined,
          dateFrom: dateFrom ? Number(dateFrom) : undefined,
          dateTo: dateTo ? Number(dateTo) : undefined,
        },
        this.buildActorContext(req),
      );

      return res.status(200).json(result);
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getShiftDetail = async (req: Request, res: Response) => {
    try {
      const shiftId = String(req.params.shiftId);
      const detail = await this.cashRegisterService.getShiftDetail(
        shiftId,
        this.buildActorContext(req),
      );

      return res.status(200).json(detail);
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  registerMovement = async (req: Request, res: Response) => {
    try {
      const shiftId = String(req.params.shiftId);
      const { type, direction, concept, amount, notes, metadata } = req.body as {
        type?: unknown;
        direction?: unknown;
        concept?: unknown;
        amount?: unknown;
        notes?: unknown;
        metadata?: unknown;
      };

      if (typeof type !== "string" || type.trim().length === 0) {
        return res.status(400).json({ error: "'type' es requerido" });
      }

      if (typeof concept !== "string" || concept.trim().length === 0) {
        return res.status(400).json({ error: "'concept' es requerido" });
      }

      if (typeof amount !== "number") {
        return res.status(400).json({ error: "'amount' debe ser numerico" });
      }

      const result = await this.cashRegisterService.registerMovement(
        shiftId,
        {
          type: type.trim() as never,
          direction:
            typeof direction === "string" && direction.trim().length > 0
              ? (direction.trim() as never)
              : undefined,
          concept: concept.trim(),
          amount,
          notes: typeof notes === "string" ? notes : undefined,
          metadata:
            metadata && typeof metadata === "object"
              ? (metadata as Record<string, unknown>)
              : undefined,
        },
        this.buildActorContext(req),
      );

      return res.status(201).json(result);
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  saveCount = async (req: Request, res: Response) => {
    try {
      const shiftId = String(req.params.shiftId);
      const { denominations, notes } = req.body as {
        denominations?: unknown;
        notes?: unknown;
      };

      if (!Array.isArray(denominations)) {
        return res.status(400).json({ error: "'denominations' debe ser arreglo" });
      }

      const result = await this.cashRegisterService.saveCount(
        shiftId,
        {
          denominations: denominations as Array<{
            label: string;
            value: number;
            quantity: number;
          }>,
          notes: typeof notes === "string" ? notes : undefined,
        },
        this.buildActorContext(req),
      );

      return res.status(201).json(result);
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getCutPreview = async (req: Request, res: Response) => {
    try {
      const shiftId = String(req.params.shiftId);
      const preview = await this.cashRegisterService.getCutPreview(
        shiftId,
        this.buildActorContext(req),
      );

      return res.status(200).json({ preview });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  closeShift = async (req: Request, res: Response) => {
    try {
      const shiftId = String(req.params.shiftId);
      const { denominations, notes } = req.body as {
        denominations?: unknown;
        notes?: unknown;
      };

      if (!Array.isArray(denominations)) {
        return res.status(400).json({ error: "'denominations' debe ser arreglo" });
      }

      const result = await this.cashRegisterService.closeShift(
        shiftId,
        {
          denominations: denominations as Array<{
            label: string;
            value: number;
            quantity: number;
          }>,
          notes: typeof notes === "string" ? notes : undefined,
        },
        this.buildActorContext(req),
      );

      return res.status(200).json(result);
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  private buildActorContext(req: Request): CashRegisterActorContext {
    const authRequest = req as AuthenticatedRequest;
    const authUser = getAuthenticatedRequestUser(req) as
      | (Record<string, unknown> & { nombre?: unknown; apellido?: unknown })
      | undefined;

    const fullName = [authUser?.nombre, authUser?.apellido]
      .map((value) => (typeof value === "string" ? value.trim() : ""))
      .filter(Boolean)
      .join(" ");

    return {
      userId: String(authRequest.uid ?? ""),
      userName: fullName || undefined,
      allowedProjectIds: getAllowedProjectIdsFromRequest(req),
      isSuperAdmin: isSuperAdminRequest(req),
    };
  }
}
