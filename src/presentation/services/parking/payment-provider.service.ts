import { envs } from "../../../config";
import {
  validatePaymentProviderConfig,
  type PaymentProviderEntity,
  type PaymentProviderInput,
} from "../../../domain/entities/parking/payment-provider.entity";
import { CustomError } from "../../../domain/errors/custom.error";
import { PaymentProviderRepository } from "../../../domain/repositories/parking/payment-provider.repository";

export class PaymentProviderService {
  constructor(
    private readonly repository: PaymentProviderRepository,
    // Plain http to this machine is only for trying the reference provider outside production.
    private readonly allowLocalHttp = !envs.PROD,
  ) {}

  getAll() { return this.repository.getAll(); }

  async create(data: PaymentProviderInput) {
    this.validate({ ...data, hasCredential: Boolean(data.credential) });
    return this.repository.create(data);
  }

  async update(id: string, data: Partial<PaymentProviderInput>) {
    const current = await this.repository.findById(id);
    if (!current) throw CustomError.notFound("Proveedor no encontrado");
    // The configuration is valid as a whole, e.g. switching to "standard" needs a URL and a credential.
    this.validate({ ...this.toInput(current), ...data, hasCredential: current.hasCredential || Boolean(data.credential) });
    const result = await this.repository.update(id, data);
    if (!result) throw CustomError.notFound("Proveedor no encontrado");
    return result;
  }

  async delete(id: string) {
    const result = await this.repository.delete(id);
    if (!result) throw CustomError.notFound("Proveedor no encontrado");
    return result;
  }

  private toInput(provider: PaymentProviderEntity): PaymentProviderInput {
    const { nombre, integration, adapter, baseUrl, active, timeoutMs } = provider;
    return { nombre, integration, adapter, baseUrl, active, timeoutMs };
  }

  private validate(config: PaymentProviderInput & { hasCredential: boolean }) {
    const error = validatePaymentProviderConfig(config, { allowLocalHttp: this.allowLocalHttp });
    if (error) throw CustomError.badRequest(error);
  }
}
