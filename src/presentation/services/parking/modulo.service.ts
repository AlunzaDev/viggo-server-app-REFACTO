import { ModuloEntity } from "../../../domain/entities/parking/modulo.entity";
import { ModuloRepository } from "../../../domain/repository/parking/modulo.repository";
import { ProyectoRepository } from "../../../domain/repository/parking/proyecto.repository";
import {
  DeviceConnectionAuditPayload,
  DeviceRegistrationPayload,
  ModuloFilters,
  DeviceRuntimePayload,
  ResolveDeviceBindingRequestPayload,
} from "./modulo-device-binding.types";
import { ModuloCrudService } from "./modulo-crud.service";
import { ModuloDeviceLifecycleService } from "./modulo-device-lifecycle.service";

export class ModuloService {
  private readonly crudService: ModuloCrudService;
  private readonly deviceLifecycleService: ModuloDeviceLifecycleService;

  constructor(
    private readonly moduloRepository: ModuloRepository,
    private readonly proyectoRepository: ProyectoRepository,
  ) {
    this.crudService = new ModuloCrudService(
      this.moduloRepository,
      this.proyectoRepository,
    );
    this.deviceLifecycleService = new ModuloDeviceLifecycleService(
      this.moduloRepository,
    );
  }

  async createModulo(modulo: Omit<ModuloEntity, "id">): Promise<ModuloEntity> {
    return this.crudService.createModulo(modulo);
  }

  async getModulos(): Promise<ModuloEntity[]> {
    return this.crudService.getModulos();
  }

  async getModulosWithPendingDeviceBindingRequests(): Promise<ModuloEntity[]> {
    return this.crudService.getModulosWithPendingDeviceBindingRequests();
  }

  async getModulosFiltered(filters: ModuloFilters): Promise<ModuloEntity[]> {
    return this.crudService.getModulosFiltered(filters);
  }

  async getModuloById(id: string): Promise<ModuloEntity> {
    return this.crudService.getModuloById(id);
  }

  async getModuloByIdentificador(identificador: string): Promise<ModuloEntity> {
    return this.crudService.getModuloByIdentificador(identificador);
  }

  async getModulosByProyecto(proyectoId: string): Promise<ModuloEntity[]> {
    return this.crudService.getModulosByProyecto(proyectoId);
  }

  async updateModulo(
    id: string,
    modulo: Partial<Omit<ModuloEntity, "id">>,
  ): Promise<ModuloEntity> {
    return this.crudService.updateModulo(id, modulo);
  }

  async updateModuloStatus(id: string, estado: boolean): Promise<ModuloEntity> {
    return this.crudService.updateModuloStatus(id, estado);
  }

  async validateDeviceRegistration(
    id: string,
    device: DeviceRegistrationPayload,
  ): Promise<{ modulo: ModuloEntity; issuedDeviceSecret?: string }> {
    return this.deviceLifecycleService.validateDeviceRegistration(id, device);
  }

  async approveDeviceBindingRequest(
    id: string,
    payload: ResolveDeviceBindingRequestPayload,
  ): Promise<ModuloEntity> {
    return this.deviceLifecycleService.approveDeviceBindingRequest(id, payload);
  }

  async rejectDeviceBindingRequest(
    id: string,
    payload: ResolveDeviceBindingRequestPayload,
  ): Promise<ModuloEntity> {
    return this.deviceLifecycleService.rejectDeviceBindingRequest(id, payload);
  }

  async reopenDeviceBindingRequest(
    id: string,
    payload: ResolveDeviceBindingRequestPayload,
  ): Promise<ModuloEntity> {
    return this.deviceLifecycleService.reopenDeviceBindingRequest(id, payload);
  }

  async recordDeviceConnectionAudit(
    id: string,
    payload: DeviceConnectionAuditPayload,
  ): Promise<ModuloEntity> {
    return this.deviceLifecycleService.recordDeviceConnectionAudit(id, payload);
  }

  async updateDeviceRuntime(
    id: string,
    payload: DeviceRuntimePayload,
  ): Promise<ModuloEntity> {
    return this.deviceLifecycleService.updateDeviceRuntime(id, payload);
  }

  async recordAuthorizedHeartbeat(
    id: string,
    payload: DeviceRegistrationPayload & {
      socketId?: string;
      message?: string;
    },
  ): Promise<ModuloEntity> {
    return this.deviceLifecycleService.recordAuthorizedHeartbeat(id, payload);
  }

  async resetDeviceBinding(id: string): Promise<ModuloEntity> {
    return this.deviceLifecycleService.resetDeviceBinding(id);
  }

  async deleteModulo(id: string): Promise<ModuloEntity> {
    return this.crudService.deleteModulo(id);
  }
}
