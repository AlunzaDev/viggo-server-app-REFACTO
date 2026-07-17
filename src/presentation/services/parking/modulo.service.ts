import {
  ModuloDeviceBinding,
  ModuloDeviceBindingRequest,
  ModuloEntity,
} from "../../../domain/entities/parking/modulo.entity";
import { CustomError } from "../../../domain/errors/custom.error";
import { ModuloRepository } from "../../../domain/repository/parking/modulo.repository";
import { ProyectoRepository } from "../../../domain/repository/parking/proyecto.repository";

export interface DeviceRegistrationPayload {
  fingerprint: string;
  cpuSerial?: string;
  machineId?: string;
  primaryMac?: string;
}

export interface ResolveDeviceBindingRequestPayload {
  fingerprint?: string;
  notes?: string;
}

export class ModuloService {
  constructor(
    private readonly moduloRepository: ModuloRepository,
    private readonly proyectoRepository: ProyectoRepository,
  ) {}

  async createModulo(modulo: Omit<ModuloEntity, "id">): Promise<ModuloEntity> {
    const proyecto = await this.proyectoRepository.findById(modulo.proyecto);

    if (!proyecto) {
      throw CustomError.badRequest("El proyecto asociado no existe");
    }

    const moduloExists = await this.moduloRepository.findByIdentificador(
      modulo.identificador,
    );

    if (moduloExists) {
      throw CustomError.badRequest(
        `El modulo con identificador '${modulo.identificador}' ya existe`,
      );
    }

    return this.moduloRepository.create(modulo);
  }

  async getModulos(): Promise<ModuloEntity[]> {
    return this.moduloRepository.getAll();
  }

  async getModulosWithPendingDeviceBindingRequests(): Promise<ModuloEntity[]> {
    return this.moduloRepository.getWithPendingDeviceBindingRequests();
  }

  async getModulosFiltered(filters: {
    proyecto?: string;
    tipo?: ModuloEntity["tipo"];
    estado?: boolean;
  }): Promise<ModuloEntity[]> {
    if (filters.proyecto) {
      const proyecto = await this.proyectoRepository.findById(filters.proyecto);

      if (!proyecto) {
        throw CustomError.notFound("Proyecto no encontrado");
      }
    }

    return this.moduloRepository.getFiltered(filters);
  }

  async getModuloById(id: string): Promise<ModuloEntity> {
    const modulo = await this.moduloRepository.findById(id);

    if (!modulo) {
      throw CustomError.notFound("Modulo no encontrado");
    }

    return modulo;
  }

  async getModuloByIdentificador(identificador: string): Promise<ModuloEntity> {
    const modulo = await this.moduloRepository.findByIdentificador(
      identificador,
    );

    if (!modulo) {
      throw CustomError.notFound("Modulo no encontrado");
    }

    return modulo;
  }

  async getModulosByProyecto(proyectoId: string): Promise<ModuloEntity[]> {
    const proyecto = await this.proyectoRepository.findById(proyectoId);

    if (!proyecto) {
      throw CustomError.notFound("Proyecto no encontrado");
    }

    return this.moduloRepository.getByProyecto(proyectoId);
  }

  async updateModulo(
    id: string,
    modulo: Partial<Omit<ModuloEntity, "id">>,
  ): Promise<ModuloEntity> {
    const currentModulo = await this.moduloRepository.findById(id);

    if (!currentModulo) {
      throw CustomError.notFound("Modulo no encontrado");
    }

    if (modulo.proyecto && modulo.proyecto !== currentModulo.proyecto) {
      const proyecto = await this.proyectoRepository.findById(modulo.proyecto);

      if (!proyecto) {
        throw CustomError.badRequest("El proyecto asociado no existe");
      }
    }

    if (
      modulo.identificador &&
      modulo.identificador !== currentModulo.identificador
    ) {
      const moduloExists = await this.moduloRepository.findByIdentificador(
        modulo.identificador,
      );

      if (moduloExists && moduloExists.id !== id) {
        throw CustomError.badRequest(
          `El modulo con identificador '${modulo.identificador}' ya existe`,
        );
      }
    }

    const moduloUpdated = await this.moduloRepository.update(id, modulo);

    if (!moduloUpdated) {
      throw CustomError.notFound("Modulo no encontrado");
    }

    return moduloUpdated;
  }

  async updateModuloStatus(id: string, estado: boolean): Promise<ModuloEntity> {
    const moduloUpdated = await this.moduloRepository.update(id, { estado });

    if (!moduloUpdated) {
      throw CustomError.notFound("Modulo no encontrado");
    }

    return moduloUpdated;
  }

  async validateDeviceRegistration(
    id: string,
    device: DeviceRegistrationPayload,
  ): Promise<ModuloEntity> {
    const modulo = await this.getModuloById(id);

    if (!modulo.estado) {
      throw CustomError.forbidden("El modulo esta inactivo");
    }

    const normalizedDevice = normalizeDeviceRegistration(device);

    if (!normalizedDevice.fingerprint) {
      throw CustomError.badRequest("El deviceFingerprint es requerido");
    }

    if (normalizedDevice.fingerprint === "unknown") {
      throw CustomError.forbidden(
        "No se pudo identificar el dispositivo fisico",
      );
    }

    const currentBinding = modulo.deviceBinding;
    const pendingRequest = findPendingRequest(
      modulo.deviceBindingRequests,
      normalizedDevice.fingerprint,
    );

    if (currentBinding?.fingerprint === normalizedDevice.fingerprint) {
      const moduloUpdated = await this.moduloRepository.update(id, {
        deviceBinding: buildNextDeviceBinding(currentBinding, normalizedDevice),
      });

      if (!moduloUpdated) {
        throw CustomError.notFound("Modulo no encontrado");
      }

      return moduloUpdated;
    }

    if (
      currentBinding?.fingerprint &&
      currentBinding.fingerprint !== normalizedDevice.fingerprint
    ) {
      const moduloUpdated = await this.moduloRepository.update(id, {
        deviceBindingRequests: upsertDeviceBindingRequest(
          modulo.deviceBindingRequests,
          normalizedDevice,
          "PENDING",
        ),
      });

      if (!moduloUpdated) {
        throw CustomError.notFound("Modulo no encontrado");
      }

      throw CustomError.forbidden(
        "Este modulo ya esta vinculado a otro dispositivo. Solicitud pendiente de aprobacion.",
        { moduloId: id, fingerprint: normalizedDevice.fingerprint },
        "DEVICE_BINDING_PENDING_APPROVAL",
      );
    }

    if (pendingRequest?.status === "PENDING") {
      throw CustomError.forbidden(
        "Este dispositivo esta pendiente de aprobacion",
        { moduloId: id, fingerprint: normalizedDevice.fingerprint },
        "DEVICE_BINDING_PENDING_APPROVAL",
      );
    }

    const moduloUpdated = await this.moduloRepository.update(id, {
      deviceBindingRequests: upsertDeviceBindingRequest(
        modulo.deviceBindingRequests,
        normalizedDevice,
        "PENDING",
      ),
    });

    if (!moduloUpdated) {
      throw CustomError.notFound("Modulo no encontrado");
    }

    throw CustomError.forbidden(
      "Dispositivo pendiente de aprobacion",
      { moduloId: id, fingerprint: normalizedDevice.fingerprint },
      "DEVICE_BINDING_PENDING_APPROVAL",
    );
  }

  async approveDeviceBindingRequest(
    id: string,
    payload: ResolveDeviceBindingRequestPayload,
  ): Promise<ModuloEntity> {
    const modulo = await this.getModuloById(id);
    const pendingRequest = findPendingRequest(
      modulo.deviceBindingRequests,
      payload.fingerprint,
    );

    if (!pendingRequest) {
      throw CustomError.notFound(
        "No se encontro una solicitud pendiente para ese dispositivo",
      );
    }

    const resolvedRequest = resolveRequest(
      pendingRequest,
      "APPROVED",
      payload.notes,
    );

    const moduloUpdated = await this.moduloRepository.update(id, {
      deviceBinding: buildNextDeviceBinding(modulo.deviceBinding, {
        fingerprint: resolvedRequest.fingerprint,
        cpuSerial: resolvedRequest.cpuSerial,
        machineId: resolvedRequest.machineId,
        primaryMac: resolvedRequest.primaryMac,
      }),
      deviceBindingRequests: replaceRequest(
        modulo.deviceBindingRequests,
        resolvedRequest,
      ),
    });

    if (!moduloUpdated) {
      throw CustomError.notFound("Modulo no encontrado");
    }

    return moduloUpdated;
  }

  async rejectDeviceBindingRequest(
    id: string,
    payload: ResolveDeviceBindingRequestPayload,
  ): Promise<ModuloEntity> {
    const modulo = await this.getModuloById(id);
    const pendingRequest = findPendingRequest(
      modulo.deviceBindingRequests,
      payload.fingerprint,
    );

    if (!pendingRequest) {
      throw CustomError.notFound(
        "No se encontro una solicitud pendiente para ese dispositivo",
      );
    }

    const resolvedRequest = resolveRequest(
      pendingRequest,
      "REJECTED",
      payload.notes,
    );

    const moduloUpdated = await this.moduloRepository.update(id, {
      deviceBindingRequests: replaceRequest(
        modulo.deviceBindingRequests,
        resolvedRequest,
      ),
    });

    if (!moduloUpdated) {
      throw CustomError.notFound("Modulo no encontrado");
    }

    return moduloUpdated;
  }

  async resetDeviceBinding(id: string): Promise<ModuloEntity> {
    const modulo = await this.getModuloById(id);
    const moduloUpdated = await this.moduloRepository.update(id, {
      deviceBinding: null,
      deviceBindingRequests: modulo.deviceBindingRequests.map((request) =>
        request.status === "PENDING"
          ? resolveRequest(request, "REJECTED", "Reset manual del modulo")
          : request,
      ),
    });

    if (!moduloUpdated) {
      throw CustomError.notFound("Modulo no encontrado");
    }

    return moduloUpdated;
  }

  async deleteModulo(id: string): Promise<ModuloEntity> {
    const moduloDeleted = await this.moduloRepository.delete(id);

    if (!moduloDeleted) {
      throw CustomError.notFound("Modulo no encontrado");
    }

    return moduloDeleted;
  }
}

function normalizeDeviceRegistration(
  device: DeviceRegistrationPayload,
): DeviceRegistrationPayload {
  return {
    fingerprint: String(device.fingerprint ?? "").trim().toLowerCase(),
    cpuSerial: String(device.cpuSerial ?? "").trim().toLowerCase() || undefined,
    machineId: String(device.machineId ?? "").trim().toLowerCase() || undefined,
    primaryMac: String(device.primaryMac ?? "").trim().toLowerCase() || undefined,
  };
}

function buildNextDeviceBinding(
  currentBinding: ModuloDeviceBinding | null | undefined,
  device: DeviceRegistrationPayload,
): ModuloDeviceBinding {
  const now = new Date();

  return {
    fingerprint: device.fingerprint,
    cpuSerial: device.cpuSerial,
    machineId: device.machineId,
    primaryMac: device.primaryMac,
    boundAt: currentBinding?.boundAt ?? now,
    lastSeenAt: now,
  };
}

function upsertDeviceBindingRequest(
  requests: ModuloDeviceBindingRequest[],
  device: DeviceRegistrationPayload,
  status: "PENDING",
): ModuloDeviceBindingRequest[] {
  const now = new Date();
  const nextRequest: ModuloDeviceBindingRequest = {
    fingerprint: device.fingerprint,
    cpuSerial: device.cpuSerial,
    machineId: device.machineId,
    primaryMac: device.primaryMac,
    status,
    requestedAt: now,
  };

  const remainingRequests = requests.filter(
    (request) => request.fingerprint !== device.fingerprint,
  );

  return [...remainingRequests, nextRequest];
}

function findPendingRequest(
  requests: ModuloDeviceBindingRequest[],
  fingerprint?: string,
): ModuloDeviceBindingRequest | null {
  const pendingRequests = requests.filter((request) => request.status === "PENDING");

  if (!pendingRequests.length) {
    return null;
  }

  if (fingerprint) {
    return (
      pendingRequests.find((request) => request.fingerprint === fingerprint) ?? null
    );
  }

  return pendingRequests.sort(
    (left, right) => right.requestedAt.getTime() - left.requestedAt.getTime(),
  )[0];
}

function resolveRequest(
  request: ModuloDeviceBindingRequest,
  status: "APPROVED" | "REJECTED",
  notes?: string,
): ModuloDeviceBindingRequest {
  return {
    ...request,
    status,
    resolvedAt: new Date(),
    notes: String(notes ?? "").trim() || request.notes,
  };
}

function replaceRequest(
  requests: ModuloDeviceBindingRequest[],
  nextRequest: ModuloDeviceBindingRequest,
): ModuloDeviceBindingRequest[] {
  return requests.map((request) =>
    request.fingerprint === nextRequest.fingerprint ? nextRequest : request,
  );
}
