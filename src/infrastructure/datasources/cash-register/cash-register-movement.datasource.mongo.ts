import { CashRegisterMovementModel } from "../../../data/mongo/models/cash-register/cash-register-movement.schema";
import { CashRegisterMovementDatasource } from "../../../domain/datasources/cash-register/cash-register-movement.datasource";
import { CashRegisterMovementEntity } from "../../../domain/entities/cash-register/cash-register-movement.entity";

export class CashRegisterMovementMongoDatasource
  implements CashRegisterMovementDatasource
{
  async create(
    movement: Omit<CashRegisterMovementEntity, "id">,
  ): Promise<CashRegisterMovementEntity> {
    const created = await CashRegisterMovementModel.create(movement);
    return CashRegisterMovementEntity.fromObject(created.toJSON());
  }

  async findById(id: string): Promise<CashRegisterMovementEntity | null> {
    const movement = await CashRegisterMovementModel.findById(id);
    return movement ? CashRegisterMovementEntity.fromObject(movement.toJSON()) : null;
  }

  async getByShiftId(shiftId: string): Promise<CashRegisterMovementEntity[]> {
    const items = await CashRegisterMovementModel.find({ shiftId }).sort({
      createdAt: -1,
    });

    return items.map((item) => CashRegisterMovementEntity.fromObject(item.toJSON()));
  }

  async findByCashPaymentSessionId(
    cashPaymentSessionId: string,
  ): Promise<CashRegisterMovementEntity | null> {
    const movement = await CashRegisterMovementModel.findOne({
      relatedCashPaymentSessionId: cashPaymentSessionId,
    });

    return movement ? CashRegisterMovementEntity.fromObject(movement.toJSON()) : null;
  }
}
