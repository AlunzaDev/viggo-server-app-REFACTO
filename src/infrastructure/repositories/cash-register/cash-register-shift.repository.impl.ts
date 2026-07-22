import {
  CashRegisterShiftDatasource,
  CashRegisterShiftFilters,
} from "../../../domain/datasources/cash-register/cash-register-shift.datasource";
import { CashRegisterShiftEntity } from "../../../domain/entities/cash-register/cash-register-shift.entity";
import { CashRegisterShiftRepository } from "../../../domain/repository/cash-register/cash-register-shift.repository";

export class CashRegisterShiftRepositoryImpl
  implements CashRegisterShiftRepository
{
  constructor(
    private readonly datasource: CashRegisterShiftDatasource,
  ) {}

  create(
    shift: Omit<CashRegisterShiftEntity, "id">,
  ): Promise<CashRegisterShiftEntity> {
    return this.datasource.create(shift);
  }

  findById(id: string): Promise<CashRegisterShiftEntity | null> {
    return this.datasource.findById(id);
  }

  findOpenByModuloId(
    moduloId: string,
  ): Promise<CashRegisterShiftEntity | null> {
    return this.datasource.findOpenByModuloId(moduloId);
  }

  findOpenByUserId(userId: string): Promise<CashRegisterShiftEntity | null> {
    return this.datasource.findOpenByUserId(userId);
  }

  getByFilters(filters: CashRegisterShiftFilters): Promise<{
    items: CashRegisterShiftEntity[];
    total: number;
  }> {
    return this.datasource.getByFilters(filters);
  }

  update(
    id: string,
    shift: Partial<Omit<CashRegisterShiftEntity, "id">>,
  ): Promise<CashRegisterShiftEntity | null> {
    return this.datasource.update(id, shift);
  }
}
