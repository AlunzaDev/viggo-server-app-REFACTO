import {
  ModuloDeviceBinding,
  ModuloEntity,
} from "../../../domain/entities/parking/modulo.entity";
import { bcryptPlugin } from "../../../config/plugins/bcrypt.plugin";
import { CustomError } from "../../../domain/errors/custom.error";
import { ModuloRepository } from "../../../domain/repository/parking/modulo.repository";
import {
  buildDeviceRuntimePayload,
  buildNextDeviceBinding,
  findPendingRequest,
  findRejectedRequest,
  findRequest,
  generateDeviceSecret,
  normalizeDeviceRegistration,
  reopenRequest,
  replaceRequest,
  resolveRequest,
  upsertDeviceBindingRequest,
} from "./modulo-device-binding.helpers";
import {
  DeviceConnectionAuditPayload,
  DeviceRegistrationPayload,
  DeviceRuntimePayload,
  ResolveDeviceBindingRequestPayload,
} from "./modulo-device-binding.types";

export class ModuloDeviceLifecycleService {
  constructor(private readonly moduloRepository: ModuloRepository) {}

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
      return this.validateCurrentAuthorizedDevice(
        id,
        currentBinding,
        normalizedDevice,
      );
    }

    if (
      currentBinding?.fingerprint &&
      currentBinding.fingerprint !== normalizedDevice.fingerprint
    ) {
      await this.createPendingRequest(id, modulo, normalizedDevice);
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

    await this.createPendingRequest(id, modulo, normalizedDevice);
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
      deviceBinding: buildNextDeviceBinding(
        modulo.deviceBinding,
        {
          fingerprint: resolvedRequest.fingerprint,
          cpuSerial: resolvedRequest.cpuSerial,
          machineId: resolvedRequest.machineId,
          primaryMac: resolvedRequest.primaryMac,
          deviceSecret: "",
        },
        {
          deviceSecretHash: null,
          deviceSecretIssuedAt: null,
        },
      ),
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
    const modulo = await this.getModuloById(id);
    const moduloUpdated = await this.moduloRepository.update(id, {
      deviceBinding: null,
      deviceBindingRequests: modulo.deviceBindingRequests,
      deviceRuntime: null,
    });

    if (!moduloUpdated) {
      throw CustomError.notFound("Modulo no encontrado");
    }

    return moduloUpdated;
  }

  private async getModuloById(id: string): Promise<ModuloEntity> {
    const modulo = await this.moduloRepository.findById(id);

    if (!modulo) {
      throw CustomError.notFound("Modulo no encontrado");
    }

    return modulo;
  }

  private async createPendingRequest(
    id: string,
    modulo: ModuloEntity,
    normalizedDevice: ReturnType<typeof normalizeDeviceRegistration>,
  ): Promise<void> {
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
  }

  private async validateCurrentAuthorizedDevice(
    id: string,
    currentBinding: ModuloDeviceBinding,
    normalizedDevice: ReturnType<typeof normalizeDeviceRegistration>,
  ): Promise<{ modulo: ModuloEntity; issuedDeviceSecret?: string }> {
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
}
