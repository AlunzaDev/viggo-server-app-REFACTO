import type { ParkingRateCopyDatasource } from "../../../domain/datasources/parking/parking-rate-copy.datasource";
import type {
  CreateProyectoResult,
  ProyectoInstallationLinkTokenResult,
} from "../../../domain/datasources/parking/proyecto.datasource";
import type { ProyectoListQueryDto } from "../../../domain/dtos/parking/proyecto-list-query.dto";
import { canAccessProject, type ProjectAccess } from "../../../domain/entities/auth/project-access";
import { ProyectoEntity } from "../../../domain/entities/parking/proyecto.entity";
import { CustomError } from "../../../domain/errors/custom.error";
import { ProyectoRepository } from "../../../domain/repositories/parking/proyecto.repository";

/** Lowercase without accents, so "nunoa" finds "Ñuñoa". */
const normalizeText = (value: string) =>
  value.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/**
 * The parkings. Operations on one parking receive the user's access and refuse the parkings
 * the user does not see.
 */
export class ProyectoService {
  constructor(
    private readonly proyectoRepository: ProyectoRepository,
    private readonly parkingRates?: ParkingRateCopyDatasource,
  ) {}

  async createProyecto(proyecto: Omit<ProyectoEntity, "id">): Promise<CreateProyectoResult> {
    const proyectoExists = await this.proyectoRepository.findByIdentificador(proyecto.identificador);
    if (proyectoExists) throw CustomError.badRequest(`El proyecto con identificador '${proyecto.identificador}' ya existe`);
    return this.proyectoRepository.create(proyecto);
  }

  async getProyectos(): Promise<ProyectoEntity[]> {
    return this.proyectoRepository.getAll();
  }

  /** The user's parkings that match the filters and the free text. */
  async listProyectos(query: ProyectoListQueryDto, access: ProjectAccess): Promise<ProyectoEntity[]> {
    let proyectos = (await this.proyectoRepository.getAll()).filter((proyecto) => canAccessProject(access, proyecto.id));
    if (query.estado !== undefined) proyectos = proyectos.filter((proyecto) => proyecto.estado === query.estado);
    if (query.ciudad) {
      const ciudad = normalizeText(query.ciudad);
      proyectos = proyectos.filter((proyecto) => normalizeText(proyecto.ciudad).includes(ciudad));
    }
    if (query.search) {
      const search = normalizeText(query.search);
      proyectos = proyectos.filter((proyecto) =>
        [proyecto.nombre, proyecto.identificador, proyecto.ciudad, proyecto.direccion ?? "", proyecto.descripcion ?? ""]
          .some((value) => normalizeText(String(value ?? "")).includes(search)),
      );
    }
    return proyectos;
  }

  async getProyectoById(id: string, access?: ProjectAccess): Promise<ProyectoEntity> {
    if (access) this.ensureAccess(access, id);
    const proyecto = await this.proyectoRepository.findById(id);
    if (!proyecto) throw CustomError.notFound("Proyecto no encontrado");
    return proyecto;
  }

  /** The rate the parking's OPERATIVO charges with (read-only copy) and its earlier versions. */
  async getParkingRate(id: string, access: ProjectAccess) {
    await this.getProyectoById(id, access);
    const historial = this.parkingRates ? await this.parkingRates.listRates(id, 20) : [];
    return { tarifa: historial[0] ?? null, historial };
  }

  async getInstallationLinkToken(id: string, access: ProjectAccess): Promise<ProyectoInstallationLinkTokenResult> {
    this.ensureAccess(access, id);
    const result = await this.proyectoRepository.getInstallationLinkToken(id);
    if (!result) throw CustomError.notFound("Proyecto no encontrado");
    if (!result.installationLinkToken) {
      throw CustomError.badRequest("Este proyecto no tiene un token visible guardado. Solo se conserva el hash del token anterior.");
    }
    return result;
  }

  async regenerateInstallationLinkToken(id: string, access: ProjectAccess): Promise<ProyectoInstallationLinkTokenResult> {
    this.ensureAccess(access, id);
    const result = await this.proyectoRepository.regenerateInstallationLinkToken(id);
    if (!result) throw CustomError.notFound("Proyecto no encontrado");
    return result;
  }

  async updateProyecto(id: string, proyecto: Partial<Omit<ProyectoEntity, "id">>, access: ProjectAccess): Promise<ProyectoEntity> {
    this.ensureAccess(access, id);
    const proyectoUpdated = await this.proyectoRepository.update(id, proyecto);
    if (!proyectoUpdated) throw CustomError.notFound("Proyecto no encontrado");
    return proyectoUpdated;
  }

  async updateProyectoStatus(id: string, estado: boolean, access: ProjectAccess): Promise<ProyectoEntity> {
    return this.updateProyecto(id, { estado }, access);
  }

  async deleteProyecto(id: string, access: ProjectAccess): Promise<ProyectoEntity> {
    this.ensureAccess(access, id);
    const proyectoDeleted = await this.proyectoRepository.delete(id);
    if (!proyectoDeleted) throw CustomError.notFound("Proyecto no encontrado");
    return proyectoDeleted;
  }

  private ensureAccess(access: ProjectAccess, projectId: string) {
    if (!canAccessProject(access, projectId)) throw CustomError.forbidden("Forbidden");
  }
}
