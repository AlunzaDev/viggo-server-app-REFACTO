import { INSTALLATION_OFFLINE_MS, INSTALLATION_ONLINE_MS } from "@alunzadev/viggo-contracts";
import { Request, Response } from "express";
import { PostgresDatabase } from "../../../data/postgres";
import type { InstallationsRepository } from "../../../domain/repositories/installations/installations.repository";
import type { MobileOperationRepository } from "../../../domain/repositories/mobile/mobile-operation.repository";
import { FinancialReconciliationService } from "../../services/payments/financial-reconciliation.service";

// The same presence the heartbeat screen shows (OPERATIVO polls every 15 s; two misses are tolerated).
const onlineThresholdMs = INSTALLATION_ONLINE_MS;
const degradedThresholdMs = INSTALLATION_OFFLINE_MS;

export class HealthController {
  constructor(
    private readonly installations: InstallationsRepository,
    private readonly operations: MobileOperationRepository,
  ) {}

  summary = async (_req: Request, res: Response) => {
    const db = await this.getDbSnapshot();
    const sync = await this.getSyncSnapshot();
    const worker = FinancialReconciliationService.getHealthSnapshot();
    const status = db.status === "ok" && sync.status !== "down" ? "ok" : "degraded";
    return res.status(status === "ok" ? 200 : 503).json({
      service: "viggo-administrativo",
      status,
      serverTime: Date.now(),
      db,
      sync,
      financialWorker: worker,
    });
  };

  db = async (_req: Request, res: Response) => {
    const db = await this.getDbSnapshot();
    return res.status(db.status === "ok" ? 200 : 503).json({
      service: "viggo-administrativo",
      ...db,
    });
  };

  private getDbSnapshot() {
    return PostgresDatabase.getHealthSnapshot();
  }

  sync = async (_req: Request, res: Response) => {
    const sync = await this.getSyncSnapshot();
    return res.status(sync.status === "down" ? 503 : 200).json(sync);
  };

  financialWorker = async (_req: Request, res: Response) => {
    const worker = FinancialReconciliationService.getHealthSnapshot();
    return res.status(worker.status === "ok" ? 200 : 503).json(worker);
  };

  private async getSyncSnapshot() {
    const now = Date.now();
    const [connectivity, queuedCommands, deadLetterCommands] = await Promise.all([
      this.installations.getConnectivitySummary(now - onlineThresholdMs, now - degradedThresholdMs),
      this.operations.countByStatus(["pending", "failed"]),
      this.operations.countByStatus(["dead_letter"]),
    ]);
    const {
      approved: approvedInstallations,
      online: onlineInstallations,
      degraded: degradedInstallations,
      offline: offlineInstallations,
    } = connectivity;
    return {
      service: "viggo-administrativo-sync",
      status:
        approvedInstallations === 0
          ? "degraded"
          : onlineInstallations > 0
            ? degradedInstallations > 0 || offlineInstallations.length > 0 ? "degraded" : "ok"
            : "down",
      approvedInstallations,
      onlineInstallations,
      degradedInstallations,
      offlineInstallations: offlineInstallations.length,
      queuedCommands,
      deadLetterCommands,
      onlineThresholdMs,
      degradedThresholdMs,
      serverTime: now,
    };
  }
}
