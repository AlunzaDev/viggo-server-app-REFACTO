import { CashRegisterCutDatasource } from "../../datasources/cash-register/cash-register-cut.datasource";
import { CashRegisterCutEntity } from "../../entities/cash-register/cash-register-cut.entity";

export abstract class CashRegisterCutRepository extends CashRegisterCutDatasource {
  abstract override create(
    cut: Omit<CashRegisterCutEntity, "id">,
  ): Promise<CashRegisterCutEntity>;

  abstract override findByShiftId(
    shiftId: string,
  ): Promise<CashRegisterCutEntity | null>;
}
