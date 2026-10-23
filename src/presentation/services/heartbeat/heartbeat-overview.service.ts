import { moduleStatesAreCurrent, resolveInstallationPresence, type InstallationPresence } from "@alunzadev/viggo-contracts";
import type { ProjectAccess } from "../../../domain/entities/auth/project-access";
import { projectLocation } from "../../../domain/entities/parking/project-location";
import type { HeartbeatOverviewRepository } from "../../../domain/repositories/heartbeat/heartbeat-overview.repository";

export type InstallationState = InstallationPresence | "sin_instalacion";
type ModuleCounts = { total: number; online: number; offline: number; pending: number };

const emptyCounts = (): ModuleCounts => ({ total: 0, online: 0, offline: 0, pending: 0 });

/**
 * The heartbeat of every parking the user can see (REFACTO#60). As SIKKOUNTER's runner
 * presence: when a parking's installation stopped reaching the cloud, its module states are
 * only the last known ones, never a fresh "all modules down".
 */
export class HeartbeatOverviewService {
  constructor(private readonly overview: HeartbeatOverviewRepository) {}

  async get(access: ProjectAccess, now = Date.now()) {
    const rows = await this.overview.listProjects(access.all ? null : access.allowed);
    const proyectos = rows.map((row) => {
      const presence: InstallationState = row.installationId ? resolveInstallationPresence(row.lastSeenAt, now) : "sin_instalacion";
      const current = presence !== "sin_instalacion" && moduleStatesAreCurrent(presence, row.snapshotReceivedAt, now);
      return {
        proyectoId: row.proyectoId,
        nombre: row.nombre,
        identificador: row.identificador,
        ciudad: row.ciudad,
        /** Where to show it on the map; null without a captured location. */
        ubicacion: projectLocation(row.coordinates),
        instalacion: { estado: presence, installationId: row.installationId, ultimoContacto: row.lastSeenAt },
        /** False: the module counts are the last known, not the current state. */
        estadosVigentes: current,
        snapshotRecibido: row.snapshotReceivedAt,
        modulos: row.modules,
        ultimoHeartbeat: row.lastHeartbeatAt,
      };
    });

    const instalaciones: Record<InstallationState, number> = { online: 0, degraded: 0, offline: 0, sin_instalacion: 0 };
    const modulos = emptyCounts();
    let modulosSinEstadoVigente = 0;
    for (const proyecto of proyectos) {
      instalaciones[proyecto.instalacion.estado] += 1;
      if (!proyecto.estadosVigentes) {
        modulosSinEstadoVigente += proyecto.modulos.total;
        continue;
      }
      modulos.total += proyecto.modulos.total;
      modulos.online += proyecto.modulos.online;
      modulos.offline += proyecto.modulos.offline;
      modulos.pending += proyecto.modulos.pending;
    }

    return {
      generadoEn: now,
      // Module totals only count current states; the rest are told apart, never mixed in.
      resumen: { proyectos: proyectos.length, instalaciones, modulos, modulosSinEstadoVigente },
      proyectos,
    };
  }
}
