import { PostgresDatabase } from "../../../data/postgres";
import { ParkingRateCopyDatasource, type ParkingRateCopy } from "../../../domain/datasources/parking/parking-rate-copy.datasource";
import { isUuid } from "../postgres/prisma-errors";

const number = (value: unknown) => Number(value);

export class ParkingRateCopyPostgresDatasource extends ParkingRateCopyDatasource {
  async listRates(proyectoId: string, limit: number): Promise<ParkingRateCopy[]> {
    if (!isUuid(proyectoId)) return [];
    // Versions restart when an installation is reset: the last one saved is in force.
    const rows = await PostgresDatabase.client.operationalParkingRate.findMany({
      where: { proyectoId }, orderBy: [{ occurredAt: "desc" }, { aggregateId: "desc" }], take: limit,
    });
    return rows.map((row) => {
      // The payload is OPERATIVO's parking_rates row (to_jsonb), validated on arrival.
      const rate = row.payload as Record<string, unknown>;
      return {
        version: number(rate.version),
        toleranceMinutes: number(rate.tolerance_minutes),
        firstBlockMinutes: number(rate.first_block_minutes),
        firstBlockPrice: number(rate.first_block_price),
        fractionMinutes: number(rate.fraction_minutes),
        fractionPrice: number(rate.fraction_price),
        dailyMax: rate.daily_max === null || rate.daily_max === undefined ? null : number(rate.daily_max),
        createdBy: String(rate.created_by ?? ""),
        savedAt: row.occurredAt.getTime(),
        installationId: row.installationId,
      };
    });
  }
}
