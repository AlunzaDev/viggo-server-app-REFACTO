import { CashRegisterCountEntity } from "../../entities/cash-register/cash-register-count.entity";

export abstract class CashRegisterCountDatasource {
  abstract create(
    count: Omit<CashRegisterCountEntity, "id">,
  ): Promise<CashRegisterCountEntity>;

  abstract getByShiftId(shiftId: string): Promise<CashRegisterCountEntity[]>;

  abstract getLatestByShiftId(
    shiftId: string,
  ): Promise<CashRegisterCountEntity | null>;
}
