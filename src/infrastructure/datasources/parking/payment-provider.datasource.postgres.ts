import { PostgresDatabase } from "../../../data/postgres";
import type { PaymentProvider as Row } from "../../../generated/prisma/client";
import { PaymentProviderDatasource } from "../../../domain/datasources/parking/payment-provider.datasource";
import { PaymentProviderEntity, type PaymentProviderInput } from "../../../domain/entities/parking/payment-provider.entity";
import { encryptInstallationLinkToken } from "../../../presentation/utils/installation-link-token-crypto.util";
import { isUuid, translatePrismaError } from "../postgres/prisma-errors";

const entity = (row: Row) =>
  PaymentProviderEntity.fromObject({ ...row, hasCredential: Boolean(row.credentialEncrypted) });

/** Input -> columns; the credential is encrypted and only written when one is given. */
const columns = ({ credential, ...data }: Partial<PaymentProviderInput>) => ({
  ...data,
  ...(credential ? { credentialEncrypted: encryptInstallationLinkToken(credential) } : {}),
});

export class PaymentProviderPostgresDatasource extends PaymentProviderDatasource {
  private get providers() { return PostgresDatabase.client.paymentProvider; }

  async getAll() { return (await this.providers.findMany({ orderBy: { nombre: "asc" } })).map(entity); }

  async findById(id: string) {
    if (!isUuid(id)) return null;
    const row = await this.providers.findUnique({ where: { id } });
    return row ? entity(row) : null;
  }

  async create(data: PaymentProviderInput) {
    try { return entity(await this.providers.create({ data: { ...columns(data), nombre: data.nombre } })); }
    catch (error) { throw translatePrismaError(error); }
  }

  async update(id: string, data: Partial<PaymentProviderInput>) {
    if (!isUuid(id) || !(await this.findById(id))) return null;
    try { return entity(await this.providers.update({ where: { id }, data: columns(data) })); }
    catch (error) { throw translatePrismaError(error); }
  }

  async delete(id: string) {
    const current = await this.findById(id); if (!current) return null;
    try { await this.providers.delete({ where: { id } }); return current; }
    catch (error) { throw translatePrismaError(error); }
  }
}
