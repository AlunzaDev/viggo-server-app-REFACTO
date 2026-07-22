import { CashRegisterCutDatasource } from "../../../domain/datasources/cash-register/cash-register-cut.datasource";
import { CashRegisterCutEntity } from "../../../domain/entities/cash-register/cash-register-cut.entity";
import { CashRegisterCutRepository } from "../../../domain/repository/cash-register/cash-register-cut.repository";

export class CashRegisterCutRepositoryImpl implements CashRegisterCutRepository {
  constructor(private readonly datasource: CashRegisterCutDatasource) {}

  create(cut: Omit<CashRegisterCutEntity, "id">): Promise<CashRegisterCutEntity> {
    return this.datasource.create(cut);
  }

  findByShiftId(shiftId: string): Promise<CashRegisterCutEntity | null> {
    return this.datasource.findByShiftId(shiftId);
  }
}
