import { CashRegisterMovementEntity } from "../../entities/cash-register/cash-register-movement.entity";

export abstract class CashRegisterMovementDatasource {
  abstract create(
    movement: Omit<CashRegisterMovementEntity, "id">,
  ): Promise<CashRegisterMovementEntity>;

  abstract findById(id: string): Promise<CashRegisterMovementEntity | null>;

  abstract getByShiftId(
    shiftId: string,
  ): Promise<CashRegisterMovementEntity[]>;

  abstract findByCashPaymentSessionId(
    cashPaymentSessionId: string,
  ): Promise<CashRegisterMovementEntity | null>;
}
