import { ProyectoEntity } from "../../entities/parking/proyecto.entity";

export type CreateProyectoResult = {
    proyecto: ProyectoEntity;
    installationLinkToken: string;
};

export type ProyectoInstallationLinkTokenResult = {
    proyecto: ProyectoEntity;
    installationLinkToken: string;
};

export abstract class ProyectoDatasource {
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
