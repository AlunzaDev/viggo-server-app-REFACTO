import { randomUUID } from "node:crypto";
import { INSTALLATION_OFFLINE_MS } from "@alunzadev/viggo-contracts";
import type { ConnectionHistoryRepository } from "../../../domain/repositories/heartbeat/connection-history.repository";
import type { OperationalIncidentRepository } from "../../../domain/repositories/incidents/operational-incident.repository";
import type { InstallationsRepository } from "../../../domain/repositories/installations/installations.repository";
import type { JobLockRepository } from "../../../domain/repositories/system/job-lock.repository";
import { planInstallationIncidents } from "./installation-presence";

/** Who hears about an installation going offline or coming back (push notices, REFACTO#65). */
export type InstallationChangeNotifier = { installationChanged(change: { proyectoId: string; online: boolean; at: number }): Promise<number> };

const INTERVAL_MS = 30_000;
const LOCK_NAME = "installation-presence";
const INSTANCE_ID = randomUUID();
/** Open incidents read per tick: far more installations than any deployment has. */
const OPEN_LIMIT = 10_000;

/**
 * Opens and resolves the "installation offline" incident on its own every 30 s (REFACTO#62).
 * Before, it only opened when someone called /health/sync, and nothing ever resolved it.
 */
export class InstallationPresenceMonitor {
  private timer?: ReturnType<typeof setInterval>;
  private active?: Promise<unknown>;

  constructor(
    private readonly installations: InstallationsRepository,
    private readonly incidents: OperationalIncidentRepository,
    private readonly locks: JobLockRepository,
    private readonly history: ConnectionHistoryRepository,
    private readonly notifier?: InstallationChangeNotifier,
  ) {}

  start() {
    const tick = () => {
      if (this.active) return;
      this.active = this.runOnce().catch((error) => console.error("[ADMIN installation presence]", error))
        .finally(() => { this.active = undefined; });
    };
    tick();
    this.timer = setInterval(tick, INTERVAL_MS);
    this.timer.unref();
  }

  async stop() {
    if (this.timer) clearInterval(this.timer);
    await this.active;
  }

  /** One pass; with several API instances only the one holding the lock does it. */
  async runOnce(now = Date.now()) {
    if (!(await this.locks.tryAcquire(LOCK_NAME, INSTANCE_ID, INTERVAL_MS - 5_000))) return { opened: 0, resolved: 0 };
    const [installations, open] = await Promise.all([
      this.installations.listApprovedPresence(),
      this.incidents.list({ status: "open", type: "INSTALLATION_OFFLINE" }, { page: 1, limit: OPEN_LIMIT }),
    ]);
    const { toOpen, toResolve, backOnline } = planInstallationIncidents(installations, open.incidents.map((incident) => incident.incidentKey), now);
    for (const installation of toOpen) {
      await this.incidents.open({
        incidentKey: installation.incidentKey,
        type: "INSTALLATION_OFFLINE",
        severity: "critical",
        source: "installation-presence",
        projectId: installation.proyectoId,
        installationId: installation.installationId,
        message: "Instalación operativa sin conexión",
        metadata: { lastSeenAt: installation.lastSeenAt, offlineAfterMs: INSTALLATION_OFFLINE_MS },
      }, now);
      // History (REFACTO#63): offline since its last contact. One never seen was never online.
      if (installation.lastSeenAt) {
        await this.history.recordInstallationChange({
          proyectoId: installation.proyectoId, installationId: installation.installationId,
          fromStatus: "online", toStatus: "offline", occurredAt: installation.lastSeenAt,
        });
      }
      this.notify({ proyectoId: installation.proyectoId, online: false, at: installation.lastSeenAt ?? now });
    }
    for (const incidentKey of toResolve) await this.incidents.resolve(incidentKey, now);
    for (const installation of backOnline) {
      await this.history.recordInstallationChange({
        proyectoId: installation.proyectoId, installationId: installation.installationId,
        fromStatus: "offline", toStatus: "online", occurredAt: installation.lastSeenAt ?? now,
      });
      this.notify({ proyectoId: installation.proyectoId, online: true, at: installation.lastSeenAt ?? now });
    }
    return { opened: toOpen.length, resolved: toResolve.length };
  }

  /** Best effort, in the background: a failed notice never stops the monitor. */
  private notify(change: { proyectoId: string; online: boolean; at: number }) {
    void this.notifier?.installationChanged(change).catch((error) => console.error("[ADMIN push notices]", error));
  }
}
