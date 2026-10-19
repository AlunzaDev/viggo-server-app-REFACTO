import { PaymentProviderDatasource } from "../../../domain/datasources/parking/payment-provider.datasource";
import { PaymentProviderRepository } from "../../../domain/repositories/parking/payment-provider.repository";

export class PaymentProviderRepositoryImpl extends PaymentProviderRepository {
  constructor(private readonly datasource: PaymentProviderDatasource) { super(); }
  getAll() { return this.datasource.getAll(); }
  findById(id: string) { return this.datasource.findById(id); }
  create(data: Parameters<PaymentProviderDatasource["create"]>[0]) { return this.datasource.create(data); }
  update(id: string, data: Parameters<PaymentProviderDatasource["update"]>[1]) { return this.datasource.update(id, data); }
  delete(id: string) { return this.datasource.delete(id); }
}
