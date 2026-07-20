import { Server as SocketServer, Socket } from "socket.io";
import { envs } from "../../config";
import { CustomError } from "../../domain/errors/custom.error";
import { ModuloService } from "../services/parking/modulo.service";
import { DeviceSessionRegistry } from "./device-session-registry";
import {
  DEVICE_HEARTBEAT_TIMEOUT_MS,
  DeviceBindingUpdatedPayload,
  OpenBarrierResponse,
} from "./device-socket.types";

export class DeviceSocketRuntimeService {
  constructor(
    private readonly moduloService: ModuloService,
    private readonly registry: DeviceSessionRegistry,
  ) {}

  emitDeviceBindingUpdated(
    io: SocketServer | undefined,
    payload: DeviceBindingUpdatedPayload,
  ): void {
    if (!io) {
      return;
    }

    io.to("Modulos").emit("deviceBindingUpdated", payload);
    console.log("deviceBindingUpdated emitted:", payload);
  }

  async handleDisconnect(socket: Socket): Promise<void> {
    const moduloId = socket.data.moduloId as string | undefined;
    const runtimeStatus = this.registry.resolveDisconnectRuntimeStatus(socket.id);
    const disconnectFingerprint =
      typeof socket.data.deviceFingerprint === "string"
        ? socket.data.deviceFingerprint
        : "";
    const approvedFlag = Boolean(socket.data.deviceApproved);

    if (moduloId) {
      this.registry.deleteAuthorizedConnectionIfMatches(moduloId, socket.id);
      this.registry.deleteSession(socket.id);
      await this.moduloService.updateDeviceRuntime(moduloId, {
        fingerprint: disconnectFingerprint || undefined,
        socketId: socket.id,
        connectionStatus: runtimeStatus,
        isConnected: false,
        isAuthorized: approvedFlag,
        lastDisconnectAt: new Date(),
        message: approvedFlag
          ? "Dispositivo autorizado desconectado"
          : "Socket del dispositivo desconectado",
      });
      console.log(`Modulo ${moduloId} disconnected`);
    } else {
      this.registry.deleteSession(socket.id);
    }

    console.log(`Socket disconnected: ${socket.id}`);
  }

  async openBarrier(
    io: SocketServer | undefined,
    moduloId: string,
  ): Promise<void> {
    if (!io) {
      throw CustomError.internalServer("Socket server no inicializado");
    }

    const authorizedConnection = this.registry.getAuthorizedConnection(moduloId);

    if (!authorizedConnection) {
      if (envs.BARRIER_SOCKET_REQUIRED) {
        console.warn("Open barrier rejected: no authorized device connected", {
          moduloId,
        });
        throw CustomError.badRequest(
          "El modulo no tiene un dispositivo autorizado conectado",
        );
      }

      console.warn(
        `Modulo ${moduloId} sin dispositivo autorizado conectado. BARRIER_SOCKET_REQUIRED=false`,
      );
      return;
    }

    await this.assertAuthorizedConnection(
      moduloId,
      authorizedConnection.socketId,
      authorizedConnection.fingerprint,
    );

    const approvedSession = this.registry.getSession(
      authorizedConnection.socketId,
    );
    if (!approvedSession || approvedSession.status !== "APPROVED") {
      this.registry.deleteAuthorizedConnection(moduloId);
      console.warn(
        "Open barrier rejected: authorized session missing or not approved",
        {
          moduloId,
          socketId: authorizedConnection.socketId,
          sessionStatus: approvedSession?.status ?? null,
        },
      );
      throw CustomError.forbidden(
        "La sesion del dispositivo no esta aprobada",
        { moduloId, socketId: authorizedConnection.socketId },
        "AUTHORIZED_SESSION_NOT_APPROVED",
      );
    }

    this.registry.touchSession(authorizedConnection.socketId);

    console.log("Open barrier authorized connection validated:", {
      moduloId,
      socketId: authorizedConnection.socketId,
      fingerprint: authorizedConnection.fingerprint,
    });

    const socket = io.sockets.sockets.get(authorizedConnection.socketId);

    if (!socket) {
      this.registry.deleteAuthorizedConnection(moduloId);

      if (envs.BARRIER_SOCKET_REQUIRED) {
        console.warn("Open barrier rejected: authorized socket not available", {
          moduloId,
          socketId: authorizedConnection.socketId,
        });
        throw CustomError.badRequest(
          "El dispositivo autorizado ya no esta conectado",
        );
      }

      console.warn(
        `Socket autorizado ${authorizedConnection.socketId} no disponible para modulo ${moduloId}`,
      );
      return;
    }

    const response = await this.emitOpenBarrier(socket);

    if (!response.ok) {
      console.warn("Open barrier rejected by device response:", {
        moduloId,
        socketId: authorizedConnection.socketId,
        response,
      });
      throw CustomError.badRequest(
        response.error ?? "No se pudo abrir la barrera",
      );
    }

    console.log("Open barrier succeeded:", {
      moduloId,
      socketId: authorizedConnection.socketId,
    });
  }

  async expireStaleSessions(io: SocketServer | undefined): Promise<void> {
    const now = Date.now();

    for (const session of this.registry.getSessions()) {
      if (session.status !== "APPROVED") {
        continue;
      }

      if (now - session.lastSeenAt.getTime() <= DEVICE_HEARTBEAT_TIMEOUT_MS) {
        continue;
      }

      this.registry.deleteSession(session.socketId);
      this.registry.deleteAuthorizedConnectionIfMatches(
        session.moduloId,
        session.socketId,
      );

      await this.moduloService.updateDeviceRuntime(session.moduloId, {
        fingerprint: session.fingerprint,
        socketId: session.socketId,
        connectionStatus: "DISCONNECTED",
        isConnected: false,
        isAuthorized: true,
        lastDisconnectAt: new Date(),
        message: "La sesion expiro por falta de heartbeat",
      });

      const socket = io?.sockets.sockets.get(session.socketId);
      if (socket) {
        socket.disconnect(true);
      }

      console.warn("Authorized device session expired by heartbeat timeout", {
        moduloId: session.moduloId,
        socketId: session.socketId,
        fingerprint: session.fingerprint,
      });
    }
  }

  private async assertAuthorizedConnection(
    moduloId: string,
    socketId: string,
    fingerprint: string,
  ): Promise<void> {
    const modulo = await this.moduloService.getModuloById(moduloId);
    const approvedFingerprint = String(
      modulo.deviceBinding?.fingerprint ?? "",
    ).trim().toLowerCase();

    if (!approvedFingerprint) {
      this.registry.deleteAuthorizedConnection(moduloId);
      console.warn(
        "Authorized connection invalidated: module has no approved device",
        {
          moduloId,
          socketId,
          fingerprint,
        },
      );
      throw CustomError.forbidden(
        "El modulo no tiene un dispositivo aprobado",
        { moduloId, socketId },
        "MODULE_HAS_NO_APPROVED_DEVICE",
      );
    }

    if (approvedFingerprint !== fingerprint) {
      this.registry.deleteAuthorizedConnection(moduloId);
      console.warn("Authorized connection invalidated: fingerprint mismatch", {
        moduloId,
        socketId,
        connectedFingerprint: fingerprint,
        approvedFingerprint,
      });
      throw CustomError.forbidden(
        "El dispositivo conectado ya no coincide con el dispositivo aprobado",
        { moduloId, socketId, fingerprint, approvedFingerprint },
        "AUTHORIZED_DEVICE_MISMATCH",
      );
    }

    const approvedSession = this.registry.getSession(socketId);
    if (
      approvedSession &&
      Date.now() - approvedSession.lastSeenAt.getTime() > DEVICE_HEARTBEAT_TIMEOUT_MS
    ) {
      this.registry.deleteAuthorizedConnection(moduloId);
      this.registry.deleteSession(socketId);
      await this.moduloService.updateDeviceRuntime(moduloId, {
        fingerprint,
        socketId,
        connectionStatus: "DISCONNECTED",
        isConnected: false,
        isAuthorized: true,
        lastDisconnectAt: new Date(),
        message: "La sesion expiro por falta de heartbeat",
      });
      throw CustomError.forbidden(
        "La sesion autorizada expiro por inactividad",
        { moduloId, socketId, fingerprint },
        "AUTHORIZED_SESSION_EXPIRED",
      );
    }
  }

  private emitOpenBarrier(socket: Socket): Promise<OpenBarrierResponse> {
    return new Promise((resolve) => {
      socket
        .timeout(envs.BARRIER_SOCKET_TIMEOUT_MS)
        .emit(
          "openBarrier",
          { msg: "open" },
          (error: Error | null, response: unknown) => {
            if (error) {
              resolve({ ok: false, error: "Timeout al abrir barrera" });
              return;
            }

            const firstResponse = Array.isArray(response)
              ? response[0]
              : response;

            if (firstResponse && typeof firstResponse === "object") {
              resolve(firstResponse as OpenBarrierResponse);
              return;
            }

            resolve({ ok: true });
          },
        );
    });
  }
}
