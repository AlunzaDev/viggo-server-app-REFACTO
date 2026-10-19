import { PaymentProviderEntity } from "../../../domain/entities/parking/payment-provider.entity";
import { CustomError } from "../../../domain/errors/custom.error";
import { PaymentProviderRepository } from "../../../domain/repositories/parking/payment-provider.repository";

export class PaymentProviderService {
  constructor(private readonly repository: PaymentProviderRepository) {}
  getAll() { return this.repository.getAll(); }
  async create(data: Omit<PaymentProviderEntity, "id">) { return this.repository.create(data); }
  async update(id: string, data: Partial<Omit<PaymentProviderEntity, "id">>) {
    const result = await this.repository.update(id, data);
    if (!result) throw CustomError.notFound("Proveedor no encontrado");
    return result;
  }
  async delete(id: string) {
    const result = await this.repository.delete(id);
    if (!result) throw CustomError.notFound("Proveedor no encontrado");
    return result;
  }
}
