import { PaymentProviderEntity } from "../../entities/parking/payment-provider.entity";

export abstract class PaymentProviderDatasource {
  abstract getAll(): Promise<PaymentProviderEntity[]>;
  abstract findById(id: string): Promise<PaymentProviderEntity | null>;
  abstract create(data: Omit<PaymentProviderEntity, "id">): Promise<PaymentProviderEntity>;
  abstract update(id: string, data: Partial<Omit<PaymentProviderEntity, "id">>): Promise<PaymentProviderEntity | null>;
  abstract delete(id: string): Promise<PaymentProviderEntity | null>;
}
