import { CashRegisterMovementDatasource } from "../../datasources/cash-register/cash-register-movement.datasource";
import { CashRegisterMovementEntity } from "../../entities/cash-register/cash-register-movement.entity";

export abstract class CashRegisterMovementRepository extends CashRegisterMovementDatasource {
  abstract override create(
    movement: Omit<CashRegisterMovementEntity, "id">,
  ): Promise<CashRegisterMovementEntity>;

  abstract override findById(
    id: string,
  ): Promise<CashRegisterMovementEntity | null>;

  abstract override getByShiftId(
    shiftId: string,
  ): Promise<CashRegisterMovementEntity[]>;

  abstract override findByCashPaymentSessionId(
    cashPaymentSessionId: string,
  ): Promise<CashRegisterMovementEntity | null>;
}
