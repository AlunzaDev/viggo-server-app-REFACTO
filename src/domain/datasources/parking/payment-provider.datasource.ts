import { PaymentProviderEntity, type PaymentProviderInput } from "../../entities/parking/payment-provider.entity";

export abstract class PaymentProviderDatasource {
  abstract getAll(): Promise<PaymentProviderEntity[]>;
  abstract findById(id: string): Promise<PaymentProviderEntity | null>;
  /** `credential`, when given, is stored encrypted and never read back by the API. */
  abstract create(data: PaymentProviderInput): Promise<PaymentProviderEntity>;
  abstract update(id: string, data: Partial<PaymentProviderInput>): Promise<PaymentProviderEntity | null>;
  abstract delete(id: string): Promise<PaymentProviderEntity | null>;
  /** Marks the connection as tested (a date) or untested (null). */
  abstract setVerifiedAt(id: string, at: Date | null): Promise<PaymentProviderEntity | null>;
}
