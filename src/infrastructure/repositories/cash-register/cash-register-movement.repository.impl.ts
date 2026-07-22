import { CashRegisterMovementDatasource } from "../../../domain/datasources/cash-register/cash-register-movement.datasource";
import { CashRegisterMovementEntity } from "../../../domain/entities/cash-register/cash-register-movement.entity";
import { CashRegisterMovementRepository } from "../../../domain/repository/cash-register/cash-register-movement.repository";

export class CashRegisterMovementRepositoryImpl
  implements CashRegisterMovementRepository
{
  constructor(
    private readonly datasource: CashRegisterMovementDatasource,
  ) {}

  create(
    movement: Omit<CashRegisterMovementEntity, "id">,
  ): Promise<CashRegisterMovementEntity> {
    return this.datasource.create(movement);
  }

  findById(id: string): Promise<CashRegisterMovementEntity | null> {
    return this.datasource.findById(id);
  }

  getByShiftId(shiftId: string): Promise<CashRegisterMovementEntity[]> {
    return this.datasource.getByShiftId(shiftId);
  }

  findByCashPaymentSessionId(
    cashPaymentSessionId: string,
  ): Promise<CashRegisterMovementEntity | null> {
    return this.datasource.findByCashPaymentSessionId(cashPaymentSessionId);
  }
}
