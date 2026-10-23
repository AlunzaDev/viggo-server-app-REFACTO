import type { ConnectionHistoryFilters } from "../../../domain/datasources/heartbeat/connection-history.datasource";
import type { ConnectionHistoryQueryDto } from "../../../domain/dtos/heartbeat/connection-history-query.dto";
import { canAccessProject, type ProjectAccess } from "../../../domain/entities/auth/project-access";
import { CustomError } from "../../../domain/errors/custom.error";
import type { ConnectionHistoryRepository } from "../../../domain/repositories/heartbeat/connection-history.repository";

/** When installations and modules lost or regained connection (REFACTO#63). */
export class ConnectionHistoryService {
  constructor(private readonly history: ConnectionHistoryRepository) {}

  async list(query: ConnectionHistoryQueryDto, access: ProjectAccess) {
    const filters = this.filters(query, access);
    const { total, events } = await this.history.list(filters, { page: query.page, limit: query.limit });
    return {
      desde: query.desde,
      hasta: query.hasta,
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
      events,
    };
  }

  /** Drops and offline minutes per installation and module; the time is counted up to now. */
  async downtime(query: ConnectionHistoryQueryDto, access: ProjectAccess, now = Date.now()) {
    const items = await this.history.downtime(this.filters(query, access), now);
    return { desde: query.desde, hasta: query.hasta, items };
  }

  private filters(query: ConnectionHistoryQueryDto, access: ProjectAccess): ConnectionHistoryFilters {
    if (query.proyectoId && !canAccessProject(access, query.proyectoId)) throw CustomError.forbidden("Forbidden");
    return {
      projectIds: access.all ? null : access.allowed,
      proyectoId: query.proyectoId,
      moduloId: query.moduloId,
      sujeto: query.sujeto,
      desde: query.desde,
      hasta: query.hasta,
    };
  }
}
