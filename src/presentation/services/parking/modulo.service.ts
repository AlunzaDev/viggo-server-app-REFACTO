import {
  ModuloDeviceBinding,
  ModuloDeviceConnectionAuditStatus,
  ModuloDeviceRuntimeConnectionStatus,
  ModuloDeviceBindingRequest,
  ModuloEntity,
} from "../../../domain/entities/parking/modulo.entity";
import { bcryptPlugin } from "../../../config/plugins/bcrypt.plugin";
import { CustomError } from "../../../domain/errors/custom.error";
import { ModuloRepository } from "../../../domain/repository/parking/modulo.repository";
import { ProyectoRepository } from "../../../domain/repository/parking/proyecto.repository";
import { randomBytes } from "crypto";

export interface DeviceRegistrationPayload {
  fingerprint: string;
  cpuSerial?: string;
  machineId?: string;
  primaryMac?: string;
  ipAddress?: string;
  locationLabel?: string;
  hasActiveConnection?: boolean;
  deviceSecret?: string;
}

export interface ResolveDeviceBindingRequestPayload {
  fingerprint?: string;
  notes?: string;
}

export interface DeviceConnectionAuditPayload {
  fingerprint?: string;
  cpuSerial?: string;
  machineId?: string;
  primaryMac?: string;
  ipAddress?: string;
  locationLabel?: string;
  socketId?: string;
  status: ModuloDeviceConnectionAuditStatus;
  reason?: string;
}

export interface DeviceRuntimePayload {
  fingerprint?: string;
  socketId?: string;
  ipAddress?: string;
  locationLabel?: string;
  connectionStatus: ModuloDeviceRuntimeConnectionStatus;
  isConnected: boolean;
  isAuthorized: boolean;
  connectedAt?: Date;
  lastHeartbeatAt?: Date;
  lastDisconnectAt?: Date;
  message?: string;
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
  ): Promise<{ modulo: ModuloEntity; issuedDeviceSecret?: string }> {
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
    const rejectedRequest = findRejectedRequest(
      modulo.deviceBindingRequests,
      normalizedDevice.fingerprint,
    );

    if (rejectedRequest) {
      throw CustomError.forbidden(
        "Este dispositivo fue rechazado y requiere reset manual del modulo para volver a intentarlo.",
        { moduloId: id, fingerprint: normalizedDevice.fingerprint },
        "DEVICE_BINDING_REJECTED_MANUAL_RESET_REQUIRED",
      );
    }

    if (normalizedDevice.hasActiveConnection) {
      const moduloUpdated = await this.moduloRepository.update(id, {
        deviceBindingRequests: upsertDeviceBindingRequest(
          modulo.deviceBindingRequests,
          normalizedDevice,
          "PENDING",
          "Intento de conexion mientras ya existe un dispositivo activo para este modulo",
        ),
      });

      if (!moduloUpdated) {
        throw CustomError.notFound("Modulo no encontrado");
      }

      throw CustomError.forbidden(
        "Este modulo ya tiene un dispositivo conectado. Solicitud pendiente de aprobacion.",
        { moduloId: id, fingerprint: normalizedDevice.fingerprint },
        "MODULE_ALREADY_CONNECTED_PENDING_APPROVAL",
      );
    }

    if (currentBinding?.fingerprint === normalizedDevice.fingerprint) {
      if (currentBinding.deviceSecretHash && !normalizedDevice.deviceSecret) {
        throw CustomError.forbidden(
          "Este dispositivo requiere un secreto local valido",
          { moduloId: id, fingerprint: normalizedDevice.fingerprint },
          "DEVICE_SECRET_REQUIRED",
        );
      }

      if (
        currentBinding.deviceSecretHash &&
        normalizedDevice.deviceSecret &&
        !bcryptPlugin.compare(
          normalizedDevice.deviceSecret,
          currentBinding.deviceSecretHash,
        )
      ) {
        throw CustomError.forbidden(
          "El secreto del dispositivo no coincide con el autorizado",
          { moduloId: id, fingerprint: normalizedDevice.fingerprint },
          "DEVICE_SECRET_INVALID",
        );
      }

      const issuedDeviceSecret = currentBinding.deviceSecretHash
        ? undefined
        : generateDeviceSecret();

      const moduloUpdated = await this.moduloRepository.update(id, {
        deviceBinding: buildNextDeviceBinding(currentBinding, normalizedDevice, {
          deviceSecretHash: issuedDeviceSecret
            ? bcryptPlugin.hash(issuedDeviceSecret)
            : currentBinding.deviceSecretHash,
          deviceSecretIssuedAt: issuedDeviceSecret
            ? new Date()
            : currentBinding.deviceSecretIssuedAt,
        }),
      });

      if (!moduloUpdated) {
        throw CustomError.notFound("Modulo no encontrado");
      }

      return {
        modulo: moduloUpdated,
        issuedDeviceSecret,
      };
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
        deviceSecret: "",
      }, {
        deviceSecretHash: null,
        deviceSecretIssuedAt: null,
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

  async reopenDeviceBindingRequest(
    id: string,
    payload: ResolveDeviceBindingRequestPayload,
  ): Promise<ModuloEntity> {
    const modulo = await this.getModuloById(id);
    const request = findRequest(modulo.deviceBindingRequests, payload.fingerprint);

    if (!request) {
      throw CustomError.notFound(
        "No se encontro una solicitud para ese dispositivo",
      );
    }

    const reopenedRequest = reopenRequest(request, payload.notes);
    const shouldClearBinding =
      modulo.deviceBinding?.fingerprint === reopenedRequest.fingerprint;

    const moduloUpdated = await this.moduloRepository.update(id, {
      deviceBinding: shouldClearBinding ? null : modulo.deviceBinding,
      deviceBindingRequests: replaceRequest(
        modulo.deviceBindingRequests,
        reopenedRequest,
      ),
    });

    if (!moduloUpdated) {
      throw CustomError.notFound("Modulo no encontrado");
    }

    return moduloUpdated;
  }

  async recordDeviceConnectionAudit(
    id: string,
    payload: DeviceConnectionAuditPayload,
  ): Promise<ModuloEntity> {
    const modulo = await this.getModuloById(id);
    const now = new Date();

    const moduloUpdated = await this.moduloRepository.update(id, {
      deviceConnectionAudit: {
        fingerprint: String(payload.fingerprint ?? "").trim() || undefined,
        cpuSerial: String(payload.cpuSerial ?? "").trim() || undefined,
        machineId: String(payload.machineId ?? "").trim() || undefined,
        primaryMac: String(payload.primaryMac ?? "").trim() || undefined,
        ipAddress: String(payload.ipAddress ?? "").trim() || undefined,
        locationLabel: String(payload.locationLabel ?? "").trim() || undefined,
        socketId: String(payload.socketId ?? "").trim() || undefined,
        status: payload.status,
        reason: String(payload.reason ?? "").trim() || undefined,
        attemptedAt: now,
      },
    });

    if (!moduloUpdated) {
      throw CustomError.notFound("Modulo no encontrado");
    }

    return moduloUpdated;
  }

  async updateDeviceRuntime(
    id: string,
    payload: DeviceRuntimePayload,
  ): Promise<ModuloEntity> {
    const moduloUpdated = await this.moduloRepository.update(id, {
      deviceRuntime: buildDeviceRuntimePayload(payload),
    });

    if (!moduloUpdated) {
      throw CustomError.notFound("Modulo no encontrado");
    }

    return moduloUpdated;
  }

  async recordAuthorizedHeartbeat(
    id: string,
    payload: DeviceRegistrationPayload & {
      socketId?: string;
      message?: string;
    },
  ): Promise<ModuloEntity> {
    const modulo = await this.getModuloById(id);
    const normalizedDevice = normalizeDeviceRegistration(payload);
    const currentBinding = modulo.deviceBinding;

    if (!currentBinding?.fingerprint) {
      throw CustomError.forbidden(
        "El modulo no tiene un dispositivo aprobado",
        { moduloId: id, fingerprint: normalizedDevice.fingerprint },
        "MODULE_HAS_NO_APPROVED_DEVICE",
      );
    }

    if (currentBinding.fingerprint !== normalizedDevice.fingerprint) {
      throw CustomError.forbidden(
        "El heartbeat no coincide con el dispositivo aprobado",
        {
          moduloId: id,
          approvedFingerprint: currentBinding.fingerprint,
          fingerprint: normalizedDevice.fingerprint,
        },
        "AUTHORIZED_HEARTBEAT_MISMATCH",
      );
    }

    if (currentBinding.deviceSecretHash && !normalizedDevice.deviceSecret) {
      throw CustomError.forbidden(
        "El heartbeat requiere un secreto local valido",
        { moduloId: id, fingerprint: normalizedDevice.fingerprint },
        "DEVICE_SECRET_REQUIRED",
      );
    }

    if (
      currentBinding.deviceSecretHash &&
      normalizedDevice.deviceSecret &&
      !bcryptPlugin.compare(
        normalizedDevice.deviceSecret,
        currentBinding.deviceSecretHash,
      )
    ) {
      throw CustomError.forbidden(
        "El heartbeat recibio un secreto local invalido",
        { moduloId: id, fingerprint: normalizedDevice.fingerprint },
        "DEVICE_SECRET_INVALID",
      );
    }

    const now = new Date();
    const moduloUpdated = await this.moduloRepository.update(id, {
      deviceBinding: buildNextDeviceBinding(currentBinding, {
        fingerprint: currentBinding.fingerprint,
        cpuSerial: currentBinding.cpuSerial,
        machineId: currentBinding.machineId,
        primaryMac: currentBinding.primaryMac,
      }),
      deviceRuntime: buildDeviceRuntimePayload({
        fingerprint: normalizedDevice.fingerprint,
        socketId: String(payload.socketId ?? "").trim() || undefined,
        ipAddress: normalizedDevice.ipAddress,
        locationLabel: normalizedDevice.locationLabel,
        connectionStatus: "CONNECTED",
        isConnected: true,
        isAuthorized: true,
        connectedAt: modulo.deviceRuntime?.connectedAt ?? now,
        lastHeartbeatAt: now,
        lastDisconnectAt: modulo.deviceRuntime?.lastDisconnectAt,
        message:
          String(payload.message ?? "").trim() ||
          "Heartbeat autorizado recibido",
      }),
    });

    if (!moduloUpdated) {
      throw CustomError.notFound("Modulo no encontrado");
    }

    return moduloUpdated;
  }

  async resetDeviceBinding(id: string): Promise<ModuloEntity> {
    const moduloUpdated = await this.moduloRepository.update(id, {
      deviceBinding: null,
      deviceBindingRequests: [],
      deviceRuntime: null,
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
    ipAddress: String(device.ipAddress ?? "").trim() || undefined,
    locationLabel: String(device.locationLabel ?? "").trim() || undefined,
    hasActiveConnection: Boolean(device.hasActiveConnection),
    deviceSecret: String(device.deviceSecret ?? "").trim() || undefined,
  };
}

function buildDeviceRuntimePayload(payload: DeviceRuntimePayload) {
  return {
    fingerprint: String(payload.fingerprint ?? "").trim() || undefined,
    socketId: String(payload.socketId ?? "").trim() || undefined,
    ipAddress: String(payload.ipAddress ?? "").trim() || undefined,
    locationLabel: String(payload.locationLabel ?? "").trim() || undefined,
    connectionStatus: payload.connectionStatus,
    isConnected: Boolean(payload.isConnected),
    isAuthorized: Boolean(payload.isAuthorized),
    connectedAt: payload.connectedAt,
    lastHeartbeatAt: payload.lastHeartbeatAt,
    lastDisconnectAt: payload.lastDisconnectAt,
    message: String(payload.message ?? "").trim() || undefined,
  };
}

function buildNextDeviceBinding(
  currentBinding: ModuloDeviceBinding | null | undefined,
  device: DeviceRegistrationPayload,
  overrides?: {
    deviceSecretHash?: string | null;
    deviceSecretIssuedAt?: Date | null;
  },
): ModuloDeviceBinding {
  const now = new Date();

  return {
    fingerprint: device.fingerprint,
    cpuSerial: device.cpuSerial,
    machineId: device.machineId,
    primaryMac: device.primaryMac,
    deviceSecretHash: resolveOptionalString(
      overrides,
      overrides?.deviceSecretHash,
      currentBinding?.deviceSecretHash,
    ),
    deviceSecretIssuedAt: resolveOptionalDate(
      overrides,
      overrides?.deviceSecretIssuedAt,
      currentBinding?.deviceSecretIssuedAt,
    ),
    boundAt: currentBinding?.boundAt ?? now,
    lastSeenAt: now,
  };
}

function resolveOptionalString(
  overrides: {
    deviceSecretHash?: string | null;
    deviceSecretIssuedAt?: Date | null;
  } | undefined,
  nextValue: string | null | undefined,
  fallbackValue: string | undefined,
): string | undefined {
  if (!overrides || !Object.prototype.hasOwnProperty.call(overrides, "deviceSecretHash")) {
    return fallbackValue;
  }

  if (nextValue === null) {
    return undefined;
  }

  return nextValue || fallbackValue;
}

function resolveOptionalDate(
  overrides: {
    deviceSecretHash?: string | null;
    deviceSecretIssuedAt?: Date | null;
  } | undefined,
  nextValue: Date | null | undefined,
  fallbackValue: Date | undefined,
): Date | undefined {
  if (!overrides || !Object.prototype.hasOwnProperty.call(overrides, "deviceSecretIssuedAt")) {
    return fallbackValue;
  }

  if (nextValue === null) {
    return undefined;
  }

  return nextValue ?? fallbackValue;
}

function generateDeviceSecret(): string {
  return randomBytes(32).toString("hex");
}

function upsertDeviceBindingRequest(
  requests: ModuloDeviceBindingRequest[],
  device: DeviceRegistrationPayload,
  status: "PENDING",
  notes?: string,
): ModuloDeviceBindingRequest[] {
  const now = new Date();
  const nextRequest: ModuloDeviceBindingRequest = {
    fingerprint: device.fingerprint,
    cpuSerial: device.cpuSerial,
    machineId: device.machineId,
    primaryMac: device.primaryMac,
    ipAddress: device.ipAddress,
    locationLabel: device.locationLabel,
    status,
    requestedAt: now,
    notes: String(notes ?? "").trim() || undefined,
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

function findRejectedRequest(
  requests: ModuloDeviceBindingRequest[],
  fingerprint?: string,
): ModuloDeviceBindingRequest | null {
  if (!fingerprint) {
    return null;
  }

  return (
    requests.find(
      (request) =>
        request.fingerprint === fingerprint && request.status === "REJECTED",
    ) ?? null
  );
}

function findRequest(
  requests: ModuloDeviceBindingRequest[],
  fingerprint?: string,
): ModuloDeviceBindingRequest | null {
  if (!fingerprint) {
    return null;
  }

  return requests.find((request) => request.fingerprint === fingerprint) ?? null;
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

function reopenRequest(
  request: ModuloDeviceBindingRequest,
  notes?: string,
): ModuloDeviceBindingRequest {
  return {
    ...request,
    status: "PENDING",
    resolvedAt: undefined,
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
