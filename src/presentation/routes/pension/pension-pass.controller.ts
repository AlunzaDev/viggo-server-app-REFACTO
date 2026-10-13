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
import { envs } from "../../../config";
import { StripePlugin } from "../../../config/plugins/stripe.plugin";
import { CustomError } from "../../../domain/errors/custom.error";
import type { PaymentRepository } from "../../../domain/repositories/payments/payment.repository";
import type { PensionPassRepository } from "../../../domain/repositories/pension/pension-pass.repository";
import type { PensionRepository } from "../../../domain/repositories/pension/pension.repository";

type AuthenticatedRequest = Request & { uid?: string };

const getIdempotencyKey = (req: Request) => String(req.header("Idempotency-Key") ?? "").trim();

export class PensionPassController {
  constructor(
    private readonly service: PensionPassService,
    private readonly payments: PaymentRepository,
    private readonly pensionPasses: PensionPassRepository,
    private readonly pensions: PensionRepository,
  ) {}

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
        pensionPass: await this.service.precontractPensionPass(uid, pensionId, contractMonths, getIdempotencyKey(req)),
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
      const paymentIntentId = String(req.body?.paymentIntentId ?? "").trim();
      const operationKey = getIdempotencyKey(req);
      if (!/^[A-Za-z0-9._:-]{16,128}$/.test(operationKey)) return res.status(400).json({ error: "Idempotency-Key invalida" });
      await this.requireSucceededPayment(uid, String(req.params.id), "renewal", paymentIntentId, contractMonths, operationKey);
      return res.status(200).json({
        pensionPass: await this.service.renewPensionPass(uid, String(req.params.id), contractMonths, operationKey),
      });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  contractPensionPass = async (req: Request, res: Response) => {
    try {
      const uid = (req as AuthenticatedRequest).uid;
      if (!uid) return res.status(401).json({ error: "Unauthorized" });
      const paymentIntentId = String(req.body?.paymentIntentId ?? "").trim();
      const operationKey = getIdempotencyKey(req);
      if (!/^[A-Za-z0-9._:-]{16,128}$/.test(operationKey)) return res.status(400).json({ error: "Idempotency-Key invalida" });
      await this.requireSucceededPayment(uid, String(req.params.id), "pension", paymentIntentId, 1, operationKey);
      return res.status(200).json({
        pensionPass: await this.service.contractPensionPass(uid, String(req.params.id), operationKey),
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
      const uid = String((req as AuthenticatedRequest).uid ?? "");
      const reason = String(req.body?.reason ?? "Cancelacion administrativa").trim();
      return res.status(200).json({ pensionPass: await this.service.deletePensionPass(id, uid, reason) });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getMyPensionPassById = async (req: Request, res: Response) => {
    try {
      const uid = (req as AuthenticatedRequest).uid;
      if (!uid) return res.status(401).json({ error: "Unauthorized" });
      const pensionPass = await this.service.getPensionPassById(String(req.params.id));
      if (pensionPass.usuario !== uid) return res.status(404).json({ error: "PensionPass no encontrado" });
      return res.status(200).json({ pensionPass });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  private async requireSucceededPayment(
    userId: string,
    pensionPassId: string,
    type: "pension" | "renewal",
    paymentIntentId: string,
    months: number,
    operationKey: string,
  ) {
    if (!paymentIntentId) throw CustomError.badRequest("paymentIntentId es requerido");
    const payment = await this.payments.findRecordForUser({
      userId,
      type,
      stripePaymentIntentId: paymentIntentId,
      referenceId: pensionPassId,
    });
    if (!payment) throw CustomError.forbidden("El pago no pertenece a esta operacion de pension");
    const pass = await this.pensionPasses.findById(pensionPassId);
    const pension = pass ? await this.pensions.findById(pass.pension) : null;
    const expectedAmount = Number(pension?.precio) * months;
    if (!Number.isInteger(months) || months < 1 || months > 24 || !Number.isFinite(expectedAmount) || Number(payment.amount) !== expectedAmount) {
      throw CustomError.conflict("El monto pagado no corresponde a la vigencia solicitada");
    }
    const status = envs.STRIPE_MOCK_ENABLED || !envs.STRIPE_ENABLED
      ? "succeeded"
      : (await StripePlugin.client.paymentIntents.retrieve(paymentIntentId)).status;
    if (status !== "succeeded") throw CustomError.conflict("Stripe aun no confirma el pago");
    await this.payments.markSucceeded(payment.id, { rawProviderStatus: status, paidAt: Date.now() });
    const claimed = await this.payments.claimForOperation(payment.id, operationKey, Date.now());
    if (!claimed) throw CustomError.conflict("Este pago ya fue aplicado a otra operacion");
  }
}
