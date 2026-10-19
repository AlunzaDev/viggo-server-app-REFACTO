import { PostgresDatabase } from "../../../data/postgres";
import { PaymentProviderDatasource } from "../../../domain/datasources/parking/payment-provider.datasource";
import { PaymentProviderEntity } from "../../../domain/entities/parking/payment-provider.entity";
import { isUuid, translatePrismaError } from "../postgres/prisma-errors";

const entity = (row: { id: string; nombre: string; logo: string }) => PaymentProviderEntity.fromObject(row);

export class PaymentProviderPostgresDatasource extends PaymentProviderDatasource {
  async getAll() { return (await PostgresDatabase.client.paymentProvider.findMany({ orderBy: { nombre: "asc" } })).map(entity); }
  async findById(id: string) { if (!isUuid(id)) return null; const row = await PostgresDatabase.client.paymentProvider.findUnique({ where: { id } }); return row ? entity(row) : null; }
  async create(data: Omit<PaymentProviderEntity, "id">) {
    try { return entity(await PostgresDatabase.client.paymentProvider.create({ data: { nombre: data.nombre, logo: data.logo } })); }
    catch (error) { throw translatePrismaError(error); }
  }
  async update(id: string, data: Partial<Omit<PaymentProviderEntity, "id">>) {
    if (!isUuid(id) || !(await this.findById(id))) return null;
    try { return entity(await PostgresDatabase.client.paymentProvider.update({ where: { id }, data })); }
    catch (error) { throw translatePrismaError(error); }
  }
  async delete(id: string) {
    const current = await this.findById(id); if (!current) return null;
    try { await PostgresDatabase.client.paymentProvider.delete({ where: { id } }); return current; }
    catch (error) { throw translatePrismaError(error); }
  }
}
