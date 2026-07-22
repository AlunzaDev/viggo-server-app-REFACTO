import {
  CashRegisterShiftDatasource,
  CashRegisterShiftFilters,
} from "../../datasources/cash-register/cash-register-shift.datasource";
import { CashRegisterShiftEntity } from "../../entities/cash-register/cash-register-shift.entity";

export abstract class CashRegisterShiftRepository extends CashRegisterShiftDatasource {
  abstract override create(
    shift: Omit<CashRegisterShiftEntity, "id">,
  ): Promise<CashRegisterShiftEntity>;

  abstract override findById(
    id: string,
  ): Promise<CashRegisterShiftEntity | null>;

  abstract override findOpenByModuloId(
    moduloId: string,
  ): Promise<CashRegisterShiftEntity | null>;

  abstract override findOpenByUserId(
    userId: string,
  ): Promise<CashRegisterShiftEntity | null>;

  abstract override getByFilters(filters: CashRegisterShiftFilters): Promise<{
    items: CashRegisterShiftEntity[];
    total: number;
  }>;

  abstract override update(
    id: string,
    shift: Partial<Omit<CashRegisterShiftEntity, "id">>,
  ): Promise<CashRegisterShiftEntity | null>;
}
