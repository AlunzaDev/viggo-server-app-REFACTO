import { occupancyFigures } from "@alunzadev/viggo-contracts";
import { canAccessProject, type ProjectAccess } from "../../../domain/entities/auth/project-access";
import { CustomError } from "../../../domain/errors/custom.error";
import type { OccupancyOverviewRepository } from "../../../domain/repositories/occupancy/occupancy-overview.repository";

/** How full every parking is now, and one parking's day by hour (REFACTO#61). */
export class OccupancyOverviewService {
  constructor(private readonly occupancy: OccupancyOverviewRepository) {}

  async list(access: ProjectAccess, now = Date.now()) {
    const rows = await this.occupancy.listProjects(access.all ? null : access.allowed, now);
    const proyectos = rows.map((row) => ({
      proyectoId: row.proyectoId,
      nombre: row.nombre,
      identificador: row.identificador,
      ciudad: row.ciudad,
      zonaHoraria: row.zonaHoraria,
      tickets: row.tickets,
      pensionados: row.pensionados,
      // The shared rule: no percentage without a captured capacity, never a made-up one.
      ...occupancyFigures(row.tickets + row.pensionados, row.capacidad),
    }));

    // Consolidated over the parkings with a capacity only: cars over their spaces.
    const withCapacity = proyectos.filter((proyecto) => proyecto.capacidad !== null);
    const consolidated = occupancyFigures(
      withCapacity.reduce((sum, proyecto) => sum + proyecto.autosDentro, 0),
      withCapacity.reduce((sum, proyecto) => sum + (proyecto.capacidad ?? 0), 0),
    );
    return {
      generadoEn: now,
      resumen: {
        proyectos: proyectos.length,
        conCapacidad: withCapacity.length,
        autosDentro: proyectos.reduce((sum, proyecto) => sum + proyecto.autosDentro, 0),
        porcentaje: consolidated.porcentaje,
        lugaresLibres: consolidated.lugaresLibres,
      },
      proyectos,
    };
  }

  async today(proyectoId: string, access: ProjectAccess, now = Date.now()) {
    if (!canAccessProject(access, proyectoId)) throw CustomError.forbidden("Forbidden");
    const project = await this.occupancy.findProject(proyectoId);
    if (!project) throw CustomError.notFound("Proyecto no encontrado");
    return {
      generadoEn: now,
      proyectoId: project.proyectoId,
      nombre: project.nombre,
      zonaHoraria: project.zonaHoraria,
      capacidad: project.capacidad,
      horas: await this.occupancy.todayByHour(project.proyectoId, project.zonaHoraria, now),
    };
  }
}
