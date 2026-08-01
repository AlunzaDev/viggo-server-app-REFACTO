import { ProyectoEntity } from "../../../domain/entities/parking/proyecto.entity";
import type {
  CreateProyectoResult,
  ProyectoInstallationLinkTokenResult,
} from "../../../domain/datasources/parking/proyecto.datasource";
import { CustomError } from "../../../domain/errors/custom.error";
import { ProyectoRepository } from "../../../domain/repository/parking/proyecto.repository";

export class ProyectoService {
  constructor(private readonly proyectoRepository: ProyectoRepository) {}

  async createProyecto(
    proyecto: Omit<ProyectoEntity, "id">,
  ): Promise<CreateProyectoResult> {
    const proyectoExists = await this.proyectoRepository.findByIdentificador(
      proyecto.identificador,
    );

    if (proyectoExists) {
      throw CustomError.badRequest(
        `El proyecto con identificador '${proyecto.identificador}' ya existe`,
      );
    }

    return this.proyectoRepository.create(proyecto);
  }

  async getProyectos(): Promise<ProyectoEntity[]> {
    return this.proyectoRepository.getAll();
  }

  async getProyectoById(id: string): Promise<ProyectoEntity> {
    const proyecto = await this.proyectoRepository.findById(id);

    if (!proyecto) {
      throw CustomError.notFound("Proyecto no encontrado");
    }

    return proyecto;
  }

  async getInstallationLinkToken(
    id: string,
  ): Promise<ProyectoInstallationLinkTokenResult> {
    const result = await this.proyectoRepository.getInstallationLinkToken(id);

    if (!result) {
      throw CustomError.notFound("Proyecto no encontrado");
    }

    if (!result.installationLinkToken) {
      throw CustomError.badRequest(
        "Este proyecto no tiene un token visible guardado. Solo se conserva el hash del token anterior.",
      );
    }

    return result;
  }

  async regenerateInstallationLinkToken(
    id: string,
  ): Promise<ProyectoInstallationLinkTokenResult> {
    const result = await this.proyectoRepository.regenerateInstallationLinkToken(id);

    if (!result) {
      throw CustomError.notFound("Proyecto no encontrado");
    }

    return result;
  }

  async updateProyecto(
    id: string,
    proyecto: Partial<Omit<ProyectoEntity, "id">>,
  ): Promise<ProyectoEntity> {
    const proyectoUpdated = await this.proyectoRepository.update(id, proyecto);

    if (!proyectoUpdated) {
      throw CustomError.notFound("Proyecto no encontrado");
    }

    return proyectoUpdated;
  }

  async updateProyectoStatus(
    id: string,
    estado: boolean,
  ): Promise<ProyectoEntity> {
    const proyectoUpdated = await this.proyectoRepository.update(id, { estado });

    if (!proyectoUpdated) {
      throw CustomError.notFound("Proyecto no encontrado");
    }

    return proyectoUpdated;
  }

  async deleteProyecto(id: string): Promise<ProyectoEntity> {
    const proyectoDeleted = await this.proyectoRepository.delete(id);

    if (!proyectoDeleted) {
      throw CustomError.notFound("Proyecto no encontrado");
    }

    return proyectoDeleted;
  }
}
