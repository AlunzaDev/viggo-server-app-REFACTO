import { CashRegisterShiftEntity } from "../../entities/cash-register/cash-register-shift.entity";

export interface CashRegisterShiftFilters {
  proyectoIds?: string[];
  moduloId?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export abstract class CashRegisterShiftDatasource {
  abstract create(
    shift: Omit<CashRegisterShiftEntity, "id">,
  ): Promise<CashRegisterShiftEntity>;

  abstract findById(id: string): Promise<CashRegisterShiftEntity | null>;

  abstract findOpenByModuloId(
    moduloId: string,
  ): Promise<CashRegisterShiftEntity | null>;

  abstract findOpenByUserId(
    userId: string,
  ): Promise<CashRegisterShiftEntity | null>;

  abstract getByFilters(filters: CashRegisterShiftFilters): Promise<{
    items: CashRegisterShiftEntity[];
    total: number;
  }>;

  abstract update(
    id: string,
    shift: Partial<Omit<CashRegisterShiftEntity, "id">>,
  ): Promise<CashRegisterShiftEntity | null>;
}
