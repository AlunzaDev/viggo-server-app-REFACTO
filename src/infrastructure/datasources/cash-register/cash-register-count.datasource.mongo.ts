import { CashRegisterCountModel } from "../../../data/mongo/models/cash-register/cash-register-count.schema";
import { CashRegisterCountDatasource } from "../../../domain/datasources/cash-register/cash-register-count.datasource";
import { CashRegisterCountEntity } from "../../../domain/entities/cash-register/cash-register-count.entity";

export class CashRegisterCountMongoDatasource
  implements CashRegisterCountDatasource
{
  async create(
    count: Omit<CashRegisterCountEntity, "id">,
  ): Promise<CashRegisterCountEntity> {
    const created = await CashRegisterCountModel.create(count);
    return CashRegisterCountEntity.fromObject(created.toJSON());
  }

  async getByShiftId(shiftId: string): Promise<CashRegisterCountEntity[]> {
    const items = await CashRegisterCountModel.find({ shiftId }).sort({
      countedAt: -1,
    });

    return items.map((item) => CashRegisterCountEntity.fromObject(item.toJSON()));
  }

  async getLatestByShiftId(
    shiftId: string,
  ): Promise<CashRegisterCountEntity | null> {
    const item = await CashRegisterCountModel.findOne({ shiftId }).sort({
      countedAt: -1,
    });

    return item ? CashRegisterCountEntity.fromObject(item.toJSON()) : null;
  }
}
