import { ProyectoEntity } from "../../entities/parking/proyecto.entity";
import type {
    CreateProyectoResult,
    ProyectoInstallationLinkTokenResult,
} from "../../datasources/parking/proyecto.datasource";

export abstract class ProyectoRepository {
    abstract create(proyecto: Omit<ProyectoEntity, "id">): Promise<CreateProyectoResult>;
    abstract getInstallationLinkToken(id: string): Promise<ProyectoInstallationLinkTokenResult | null>;
    abstract regenerateInstallationLinkToken(id: string): Promise<ProyectoInstallationLinkTokenResult | null>;
    abstract findById(id: string): Promise<ProyectoEntity | null>;
    abstract findByIdentificador(identificador: string): Promise<ProyectoEntity | null>;
    abstract getAll(): Promise<ProyectoEntity[]>;
    abstract update(
        id: string,
        proyecto: Partial<Omit<ProyectoEntity, "id">>,
    ): Promise<ProyectoEntity | null>;
    abstract delete(id: string): Promise<ProyectoEntity | null>;
}
