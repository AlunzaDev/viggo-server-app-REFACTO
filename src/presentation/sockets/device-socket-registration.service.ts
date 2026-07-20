import { Socket } from "socket.io";
import { CustomError } from "../../domain/errors/custom.error";
import { ModuloService } from "../services/parking/modulo.service";
import { DeviceSessionRegistry } from "./device-session-registry";
import {
  DeviceRegistrationEventPayload,
  OpenBarrierResponse,
} from "./device-socket.types";

type SocketResponseCallback = (response: OpenBarrierResponse) => void;

export class DeviceSocketRegistrationService {
  constructor(
    private readonly moduloService: ModuloService,
    private readonly registry: DeviceSessionRegistry,
    private readonly getModuloIdFromToken: (moduleToken: string) => Promise<string>,
    private readonly getRemoteAddress: (socket: Socket) => string,
    private readonly normalizeFingerprint: (fingerprint?: string) => string,
  ) {}

  async handleDeviceRegistration(
    socket: Socket,
    payload: DeviceRegistrationEventPayload,
    callback?: SocketResponseCallback,
  ): Promise<void> {
    try {
      if (!payload.moduleToken) {
        callback?.({ ok: false, error: "moduleToken is required" });
        return;
      }

      const moduloId = await this.getModuloIdFromToken(payload.moduleToken);
      const normalizedModuleId = String(payload.moduleId ?? "").trim();

      if (normalizedModuleId && normalizedModuleId !== moduloId) {
        callback?.({ ok: false, error: "moduleId does not match token" });
        return;
      }

      this.logRegistrationPayload(socket, payload, moduloId, normalizedModuleId);

      const registrationResult =
        await this.moduloService.validateDeviceRegistration(moduloId, {
          fingerprint: String(payload.deviceFingerprint ?? "").trim(),
          cpuSerial: String(payload.deviceIdentity?.cpu_serial ?? "").trim(),
          machineId: String(payload.deviceIdentity?.machine_id ?? "").trim(),
          primaryMac: String(payload.deviceIdentity?.primary_mac ?? "").trim(),
          ipAddress: this.getRemoteAddress(socket),
          locationLabel: String(
            payload.deviceIdentity?.location_label ?? "",
          ).trim(),
          hasActiveConnection: this.registry.isAnotherActiveAuthorizedSocket(
            moduloId,
            socket.id,
          ),
          deviceSecret: String(payload.deviceSecret ?? "").trim(),
        });

      const normalizedFingerprint = this.normalizeFingerprint(
        payload.deviceFingerprint,
      );
      const now = new Date();

      this.registry.setAuthorizedConnection(moduloId, {
        socketId: socket.id,
        fingerprint: normalizedFingerprint,
      });

      await this.moduloService.updateDeviceRuntime(moduloId, {
        fingerprint: normalizedFingerprint,
        socketId: socket.id,
        ipAddress: this.getRemoteAddress(socket),
        locationLabel: String(
          payload.deviceIdentity?.location_label ?? "",
        ).trim(),
        connectionStatus: "CONNECTED",
        isConnected: true,
        isAuthorized: true,
        connectedAt: now,
        lastHeartbeatAt: now,
        message: "Dispositivo autorizado conectado",
      });

      await this.moduloService.recordDeviceConnectionAudit(moduloId, {
        fingerprint: normalizedFingerprint,
        cpuSerial: String(payload.deviceIdentity?.cpu_serial ?? "").trim(),
        machineId: String(payload.deviceIdentity?.machine_id ?? "").trim(),
        primaryMac: String(payload.deviceIdentity?.primary_mac ?? "").trim(),
        ipAddress: this.getRemoteAddress(socket),
        locationLabel: String(
          payload.deviceIdentity?.location_label ?? "",
        ).trim(),
        socketId: socket.id,
        status: "APPROVED",
        reason: "Dispositivo autorizado y conexion registrada",
      });

      this.registry.setSession({
        socketId: socket.id,
        moduloId,
        fingerprint: normalizedFingerprint,
        status: "APPROVED",
        connectedAt: now,
        lastSeenAt: now,
      });

      socket.data.moduloId = moduloId;
      socket.data.deviceFingerprint = normalizedFingerprint;
      socket.data.deviceApproved = true;

      console.log("Device registration approved:", {
        moduloId,
        socketId: socket.id,
        fingerprint: normalizedFingerprint,
        issuedDeviceSecret: Boolean(registrationResult.issuedDeviceSecret),
      });

      callback?.({
        ok: true,
        deviceSecret: registrationResult.issuedDeviceSecret,
      });
    } catch (error) {
      await this.handleRegistrationError(socket, payload, error, callback);
    }
  }

  async handleDeviceHeartbeat(
    socket: Socket,
    payload: DeviceRegistrationEventPayload,
    callback?: SocketResponseCallback,
  ): Promise<void> {
    try {
      if (!payload.moduleToken) {
        callback?.({ ok: false, error: "moduleToken is required" });
        return;
      }

      const moduloId = await this.getModuloIdFromToken(payload.moduleToken);
      const normalizedModuleId = String(payload.moduleId ?? "").trim();
      const normalizedFingerprint = this.normalizeFingerprint(
        payload.deviceFingerprint,
      );

      if (normalizedModuleId && normalizedModuleId !== moduloId) {
        callback?.({ ok: false, error: "moduleId does not match token" });
        return;
      }

      if (socket.data.moduloId !== moduloId) {
        callback?.({
          ok: false,
          error: "El socket no coincide con el modulo registrado",
          code: "SOCKET_MODULE_MISMATCH",
        });
        return;
      }

      if (socket.data.deviceFingerprint !== normalizedFingerprint) {
        callback?.({
          ok: false,
          error: "El heartbeat no coincide con el fingerprint registrado",
          code: "SOCKET_FINGERPRINT_MISMATCH",
        });
        return;
      }

      await this.moduloService.recordAuthorizedHeartbeat(moduloId, {
        fingerprint: normalizedFingerprint,
        cpuSerial: String(payload.deviceIdentity?.cpu_serial ?? "").trim(),
        machineId: String(payload.deviceIdentity?.machine_id ?? "").trim(),
        primaryMac: String(payload.deviceIdentity?.primary_mac ?? "").trim(),
        ipAddress: this.getRemoteAddress(socket),
        locationLabel: String(
          payload.deviceIdentity?.location_label ?? "",
        ).trim(),
        deviceSecret: String(payload.deviceSecret ?? "").trim(),
        socketId: socket.id,
        message: "Heartbeat autorizado recibido",
      });

      this.registry.touchSession(socket.id);
      callback?.({ ok: true });
    } catch (error) {
      await this.handleHeartbeatError(socket, payload, error, callback);
    }
  }

  private async handleRegistrationError(
    socket: Socket,
    payload: DeviceRegistrationEventPayload,
    error: unknown,
    callback?: SocketResponseCallback,
  ): Promise<void> {
    const normalizedFingerprint = this.normalizeFingerprint(
      payload.deviceFingerprint,
    );
    const moduloIdFromClient = String(payload.moduleId ?? "").trim();
    const moduloIdFromSession =
      typeof socket.data.moduloId === "string" ? socket.data.moduloId : "";
    const fallbackModuloId = moduloIdFromSession || moduloIdFromClient;

    if (error instanceof CustomError) {
      const sessionStatus = this.registry.resolveSessionStatusFromErrorCode(
        error.code,
      );

      if (fallbackModuloId && normalizedFingerprint) {
        await this.moduloService.updateDeviceRuntime(fallbackModuloId, {
          fingerprint: normalizedFingerprint,
          socketId: socket.id,
          ipAddress: this.getRemoteAddress(socket),
          locationLabel: String(
            payload.deviceIdentity?.location_label ?? "",
          ).trim(),
          connectionStatus: this.registry.resolveRuntimeStatusFromErrorCode(
            error.code,
          ),
          isConnected: false,
          isAuthorized: false,
          lastDisconnectAt: new Date(),
          message: error.message,
        });

        await this.moduloService.recordDeviceConnectionAudit(fallbackModuloId, {
          fingerprint: normalizedFingerprint,
          cpuSerial: String(payload.deviceIdentity?.cpu_serial ?? "").trim(),
          machineId: String(payload.deviceIdentity?.machine_id ?? "").trim(),
          primaryMac: String(payload.deviceIdentity?.primary_mac ?? "").trim(),
          ipAddress: this.getRemoteAddress(socket),
          locationLabel: String(
            payload.deviceIdentity?.location_label ?? "",
          ).trim(),
          socketId: socket.id,
          status: sessionStatus,
          reason: error.message,
        });

        this.registry.setSession({
          socketId: socket.id,
          moduloId: fallbackModuloId,
          fingerprint: normalizedFingerprint,
          status: sessionStatus,
          connectedAt: new Date(),
          lastSeenAt: new Date(),
        });
      }

      socket.data.moduloId = fallbackModuloId || undefined;
      socket.data.deviceFingerprint = normalizedFingerprint || undefined;
      socket.data.deviceApproved = false;

      console.warn("Device registration rejected:", {
        socketId: socket.id,
        moduloId: fallbackModuloId || null,
        code: error.code,
        message: error.message,
        details: error.details ?? null,
        sessionStatus,
      });

      callback?.({
        ok: false,
        error: error.message,
        code: error.code,
      });
      return;
    }

    const message =
      error instanceof Error ? error.message : "Invalid moduleToken";
    callback?.({ ok: false, error: message });
  }

  private async handleHeartbeatError(
    socket: Socket,
    payload: DeviceRegistrationEventPayload,
    error: unknown,
    callback?: SocketResponseCallback,
  ): Promise<void> {
    const message = error instanceof Error ? error.message : "Heartbeat invalido";
    const errorCode = error instanceof CustomError ? error.code : undefined;

    if (error instanceof CustomError) {
      const moduloId =
        typeof socket.data.moduloId === "string"
          ? socket.data.moduloId
          : String(payload.moduleId ?? "").trim();
      const fingerprint = this.normalizeFingerprint(payload.deviceFingerprint);

      if (moduloId && fingerprint) {
        await this.moduloService.updateDeviceRuntime(moduloId, {
          fingerprint,
          socketId: socket.id,
          ipAddress: this.getRemoteAddress(socket),
          locationLabel: String(
            payload.deviceIdentity?.location_label ?? "",
          ).trim(),
          connectionStatus: "MISMATCH",
          isConnected: false,
          isAuthorized: false,
          lastDisconnectAt: new Date(),
          message,
        });
      }
    }

    this.registry.deleteSession(socket.id);
    const currentModuloId =
      typeof socket.data.moduloId === "string" ? socket.data.moduloId : "";
    if (currentModuloId) {
      this.registry.deleteAuthorizedConnectionIfMatches(currentModuloId, socket.id);
    }
    socket.data.deviceApproved = false;
    callback?.({ ok: false, error: message, code: errorCode });
    socket.disconnect(true);
  }

  private logRegistrationPayload(
    socket: Socket,
    payload: DeviceRegistrationEventPayload,
    moduloId: string,
    normalizedModuleId: string,
  ): void {
    console.log("Device registration payload received:", {
      socketId: socket.id,
      moduloIdFromToken: moduloId,
      moduleIdFromClient: normalizedModuleId || null,
      deviceFingerprint: String(payload.deviceFingerprint ?? "").trim() || null,
      cpuSerial: String(payload.deviceIdentity?.cpu_serial ?? "").trim() || null,
      machineId: String(payload.deviceIdentity?.machine_id ?? "").trim() || null,
      primaryMac: String(payload.deviceIdentity?.primary_mac ?? "").trim() || null,
      ipAddress: this.getRemoteAddress(socket),
      locationLabel:
        String(payload.deviceIdentity?.location_label ?? "").trim() || null,
      hasDeviceSecret: Boolean(String(payload.deviceSecret ?? "").trim()),
    });
  }
}
