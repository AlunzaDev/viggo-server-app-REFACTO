/** A parking rate version as OPERATIVO configured it (read-only copy received by sync). */
export interface ParkingRateCopy {
  version: number;
  toleranceMinutes: number;
  firstBlockMinutes: number;
  firstBlockPrice: number;
  fractionMinutes: number;
  fractionPrice: number;
  /** null: no daily cap. */
  dailyMax: number | null;
  /** OPERATIVO user who saved it. */
  createdBy: string;
  /** When it was saved in OPERATIVO. */
  savedAt: number;
  installationId: string;
}

export abstract class ParkingRateCopyDatasource {
  /** Versions of the project's rate, the one in force (last saved) first. */
  abstract listRates(proyectoId: string, limit: number): Promise<ParkingRateCopy[]>;
}
