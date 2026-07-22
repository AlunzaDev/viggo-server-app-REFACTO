import { CashRegisterShiftModel } from "../../../data/mongo/models/cash-register/cash-register-shift.schema";
import {
  CashRegisterShiftDatasource,
  CashRegisterShiftFilters,
} from "../../../domain/datasources/cash-register/cash-register-shift.datasource";
import { CashRegisterShiftEntity } from "../../../domain/entities/cash-register/cash-register-shift.entity";

export class CashRegisterShiftMongoDatasource
  implements CashRegisterShiftDatasource
{
  async create(
    shift: Omit<CashRegisterShiftEntity, "id">,
  ): Promise<CashRegisterShiftEntity> {
    const created = await CashRegisterShiftModel.create(shift);
    return CashRegisterShiftEntity.fromObject(created.toJSON());
  }

  async findById(id: string): Promise<CashRegisterShiftEntity | null> {
    const shift = await CashRegisterShiftModel.findById(id);
    return shift ? CashRegisterShiftEntity.fromObject(shift.toJSON()) : null;
  }

  async findOpenByModuloId(
    moduloId: string,
  ): Promise<CashRegisterShiftEntity | null> {
    const shift = await CashRegisterShiftModel.findOne({
      moduloId,
      status: "open",
    }).sort({ openedAt: -1 });

    return shift ? CashRegisterShiftEntity.fromObject(shift.toJSON()) : null;
  }

  async findOpenByUserId(
    userId: string,
  ): Promise<CashRegisterShiftEntity | null> {
    const shift = await CashRegisterShiftModel.findOne({
      openedByUserId: userId,
      status: "open",
    }).sort({ openedAt: -1 });

    return shift ? CashRegisterShiftEntity.fromObject(shift.toJSON()) : null;
  }

  async getByFilters(filters: CashRegisterShiftFilters): Promise<{
    items: CashRegisterShiftEntity[];
    total: number;
  }> {
    const page = Math.max(1, Number(filters.page ?? 1));
    const limit = Math.max(1, Math.min(100, Number(filters.limit ?? 20)));
    const query: Record<string, unknown> = {};

    if (filters.proyectoIds && filters.proyectoIds.length > 0) {
      query.proyectoId = { $in: filters.proyectoIds };
    }

    if (filters.moduloId) {
      query.moduloId = filters.moduloId;
    }

    if (filters.status) {
      query.status = filters.status;
    }

    const [total, items] = await Promise.all([
      CashRegisterShiftModel.countDocuments(query),
      CashRegisterShiftModel.find(query)
        .sort({ openedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
    ]);

    return {
      total,
      items: items.map((item) => CashRegisterShiftEntity.fromObject(item.toJSON())),
    };
  }

  async update(
    id: string,
    shift: Partial<Omit<CashRegisterShiftEntity, "id">>,
  ): Promise<CashRegisterShiftEntity | null> {
    const updated = await CashRegisterShiftModel.findByIdAndUpdate(id, shift, {
      new: true,
      runValidators: true,
    });

    return updated ? CashRegisterShiftEntity.fromObject(updated.toJSON()) : null;
  }
}
