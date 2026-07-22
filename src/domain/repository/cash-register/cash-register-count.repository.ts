import { CashRegisterCountDatasource } from "../../datasources/cash-register/cash-register-count.datasource";
import { CashRegisterCountEntity } from "../../entities/cash-register/cash-register-count.entity";

export abstract class CashRegisterCountRepository extends CashRegisterCountDatasource {
  abstract override create(
    count: Omit<CashRegisterCountEntity, "id">,
  ): Promise<CashRegisterCountEntity>;

  abstract override getByShiftId(
    shiftId: string,
  ): Promise<CashRegisterCountEntity[]>;

  abstract override getLatestByShiftId(
    shiftId: string,
  ): Promise<CashRegisterCountEntity | null>;
}
