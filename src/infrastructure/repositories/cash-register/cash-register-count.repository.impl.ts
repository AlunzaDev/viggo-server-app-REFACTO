import { CashRegisterCountDatasource } from "../../../domain/datasources/cash-register/cash-register-count.datasource";
import { CashRegisterCountEntity } from "../../../domain/entities/cash-register/cash-register-count.entity";
import { CashRegisterCountRepository } from "../../../domain/repository/cash-register/cash-register-count.repository";

export class CashRegisterCountRepositoryImpl
  implements CashRegisterCountRepository
{
  constructor(private readonly datasource: CashRegisterCountDatasource) {}

  create(
    count: Omit<CashRegisterCountEntity, "id">,
  ): Promise<CashRegisterCountEntity> {
    return this.datasource.create(count);
  }

  getByShiftId(shiftId: string): Promise<CashRegisterCountEntity[]> {
    return this.datasource.getByShiftId(shiftId);
  }

  getLatestByShiftId(shiftId: string): Promise<CashRegisterCountEntity | null> {
    return this.datasource.getLatestByShiftId(shiftId);
  }
}
