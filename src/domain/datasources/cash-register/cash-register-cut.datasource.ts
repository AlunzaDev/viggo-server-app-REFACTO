import { CashRegisterCutEntity } from "../../entities/cash-register/cash-register-cut.entity";

export abstract class CashRegisterCutDatasource {
  abstract create(
    cut: Omit<CashRegisterCutEntity, "id">,
  ): Promise<CashRegisterCutEntity>;

  abstract findByShiftId(shiftId: string): Promise<CashRegisterCutEntity | null>;
}
