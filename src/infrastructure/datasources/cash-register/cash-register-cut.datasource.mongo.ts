import { CashRegisterCutModel } from "../../../data/mongo/models/cash-register/cash-register-cut.schema";
import { CashRegisterCutDatasource } from "../../../domain/datasources/cash-register/cash-register-cut.datasource";
import { CashRegisterCutEntity } from "../../../domain/entities/cash-register/cash-register-cut.entity";

export class CashRegisterCutMongoDatasource
  implements CashRegisterCutDatasource
{
  async create(
    cut: Omit<CashRegisterCutEntity, "id">,
  ): Promise<CashRegisterCutEntity> {
    const created = await CashRegisterCutModel.create(cut);
    return CashRegisterCutEntity.fromObject(created.toJSON());
  }

  async findByShiftId(shiftId: string): Promise<CashRegisterCutEntity | null> {
    const cut = await CashRegisterCutModel.findOne({ shiftId });
    return cut ? CashRegisterCutEntity.fromObject(cut.toJSON()) : null;
  }
}
