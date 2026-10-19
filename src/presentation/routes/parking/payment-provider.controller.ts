import { Request, Response } from "express";
import { PaymentProviderDto } from "../../../domain/dtos/parking/payment-provider.dto";
import { PaymentProviderService } from "../../services/parking/payment-provider.service";
import { ErrorService } from "../../services/error.service";

export class PaymentProviderController {
  constructor(private readonly service: PaymentProviderService) {}
  getAll = async (_req: Request, res: Response) => {
    try { return res.json({ proveedores: await this.service.getAll() }); }
    catch (error) { return ErrorService.handleApiError(error, res); }
  };
  create = async (req: Request, res: Response) => {
    try { const body = { ...req.body, ...(req.file?.filename ? { logo: `/uploads/providers/${req.file.filename}` } : {}) }; const [error, dto] = PaymentProviderDto.create(body); if (error) return res.status(400).json({ error }); return res.status(201).json({ proveedor: await this.service.create(dto!) }); }
    catch (error) { return ErrorService.handleApiError(error, res); }
  };
  update = async (req: Request, res: Response) => {
    try { const body = { ...req.body, ...(req.file?.filename ? { logo: `/uploads/providers/${req.file.filename}` } : {}) }; const [error, dto] = PaymentProviderDto.update(body); if (error) return res.status(400).json({ error }); return res.json({ proveedor: await this.service.update(String(req.params.id), dto!) }); }
    catch (error) { return ErrorService.handleApiError(error, res); }
  };
  delete = async (req: Request, res: Response) => {
    try { return res.json({ proveedor: await this.service.delete(String(req.params.id)) }); }
    catch (error) { return ErrorService.handleApiError(error, res); }
  };
}
