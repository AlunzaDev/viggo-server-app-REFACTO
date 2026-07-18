import { Server as HttpServer } from "http";
import { Server as SocketServer, Socket } from "socket.io";
import { envs } from "../../config";
import { JwtPlugin } from "../../config/plugins/jwt.plugin";
import { CustomError } from "../../domain/errors/custom.error";
import { ModuloMongoDatasource } from "../../infrastructure/datasources/parking/modulo.datasource.mongo";
import { ProyectoMongoDatasource } from "../../infrastructure/datasources/parking/proyecto.datasource.mongo";
import { ModuloRepositoryImpl } from "../../infrastructure/repositories/parking/modulo.repository.impl";
import { ProyectoRepositoryImpl } from "../../infrastructure/repositories/parking/proyecto.repository.impl";
import { ModuloService } from "../services/parking/modulo.service";

interface OpenBarrierResponse {
  ok?: boolean;
  error?: string;
  code?: string;
  deviceSecret?: string;
}

interface DeviceIdentityPayload {
  cpu_serial?: string;
  machine_id?: string;
  primary_mac?: string;
  location_label?: string;
}

interface AuthorizedDeviceConnection {
  socketId: string;
  fingerprint: string;
}

type DeviceConnectionStatus = "APPROVED" | "PENDING" | "REJECTED";
type DeviceRuntimeConnectionStatus =
  | "CONNECTED"
  | "DISCONNECTED"
  | "PENDING"
  | "REJECTED"
  | "MISMATCH";

interface DeviceConnectionSession {
  socketId: string;
  moduloId: string;
  fingerprint: string;
  status: DeviceConnectionStatus;
  connectedAt: Date;
  lastSeenAt: Date;
}

interface DeviceBindingUpdatedPayload {
  moduleId: string;
  fingerprint?: string;
  status: "APPROVED" | "REJECTED" | "PENDING" | "RESET";
  reason: string;
  timestamp: string;
}

const DEVICE_HEARTBEAT_INTERVAL_MS = 20000;
const DEVICE_HEARTBEAT_TIMEOUT_MS = 45000;
const STALE_SESSION_SCAN_INTERVAL_MS = 15000;

export class SocketServerPlugin {
  private static io?: SocketServer;
  private static authorizedDevices = new Map<
    string,
    AuthorizedDeviceConnection
  >();
  private static deviceSessions = new Map<string, DeviceConnectionSession>();
  private static moduloService = createModuloService();
  private static staleSessionMonitorStarted = false;

  static init(httpServer: HttpServer) {
    const io = new SocketServer(httpServer, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
      },
      transports: ["polling", "websocket"],
    });

    this.io = io;
    this.startStaleSessionMonitor();

    io.use(async (socket, next) => {
      try {
        const token = this.getHandshakeToken(socket);

        if (!token) {
          return next(new Error("No token provided"));
        }

        const payload = await JwtPlugin.validateToken(token);

        if (!payload || typeof payload !== "object") {
          return next(new Error("Invalid token"));
        }

        const uid =
          "id" in payload
            ? String(payload.id)
            : "uid" in payload
              ? String(payload.uid)
              : "";

        if (!uid) {
          return next(new Error("Invalid token"));
        }

        socket.data.uid = uid;
        next();
      } catch (_error) {
        next(new Error("Unauthorized"));
      }
    });

    io.on("connection", (socket) => {
      console.log(`Socket connected: ${socket.id}`);

      socket.on("entrarSala", ({ sala }: { sala?: string }) => {
        if (!sala) return;
        socket.join(sala);
        console.log(`Socket ${socket.id} joined room ${sala}`);
      });

      socket.on(
        "registrarDispositivo",
        async (
          {
            moduleToken,
            moduleId,
            deviceFingerprint,
            deviceIdentity,
            deviceSecret,
          }: {
            moduleToken?: string;
            moduleId?: string;
            deviceFingerprint?: string;
            deviceIdentity?: DeviceIdentityPayload;
            deviceSecret?: string;
          },
          callback?: (response: OpenBarrierResponse) => void,
        ) => {
          try {
            if (!moduleToken) {
              callback?.({ ok: false, error: "moduleToken is required" });
              return;
            }

            const moduloId = await this.getModuloIdFromToken(moduleToken);
            const normalizedModuleId = String(moduleId ?? "").trim();

            if (normalizedModuleId && normalizedModuleId !== moduloId) {
              callback?.({ ok: false, error: "moduleId does not match token" });
              return;
            }

            console.log("Device registration payload received:", {
              socketId: socket.id,
              moduloIdFromToken: moduloId,
              moduleIdFromClient: normalizedModuleId || null,
              deviceFingerprint: String(deviceFingerprint ?? "").trim() || null,
              cpuSerial:
                String(deviceIdentity?.cpu_serial ?? "").trim() || null,
              machineId:
                String(deviceIdentity?.machine_id ?? "").trim() || null,
              primaryMac:
                String(deviceIdentity?.primary_mac ?? "").trim() || null,
              ipAddress: this.getRemoteAddress(socket),
              locationLabel:
                String(deviceIdentity?.location_label ?? "").trim() || null,
              hasDeviceSecret: Boolean(String(deviceSecret ?? "").trim()),
            });

            const registrationResult =
              await this.moduloService.validateDeviceRegistration(moduloId, {
              fingerprint: String(deviceFingerprint ?? "").trim(),
              cpuSerial: String(deviceIdentity?.cpu_serial ?? "").trim(),
              machineId: String(deviceIdentity?.machine_id ?? "").trim(),
              primaryMac: String(deviceIdentity?.primary_mac ?? "").trim(),
              ipAddress: this.getRemoteAddress(socket),
              locationLabel: String(deviceIdentity?.location_label ?? "").trim(),
              hasActiveConnection:
                this.authorizedDevices.has(moduloId) &&
                this.authorizedDevices.get(moduloId)?.socketId !== socket.id,
              deviceSecret: String(deviceSecret ?? "").trim(),
            });

            const normalizedFingerprint = String(
              deviceFingerprint ?? "",
            ).trim().toLowerCase();
            const now = new Date();

            this.authorizedDevices.set(moduloId, {
              socketId: socket.id,
              fingerprint: normalizedFingerprint,
            });
            await this.moduloService.updateDeviceRuntime(moduloId, {
              fingerprint: normalizedFingerprint,
              socketId: socket.id,
              ipAddress: this.getRemoteAddress(socket),
              locationLabel: String(deviceIdentity?.location_label ?? "").trim(),
              connectionStatus: "CONNECTED",
              isConnected: true,
              isAuthorized: true,
              connectedAt: now,
              lastHeartbeatAt: now,
              message: "Dispositivo autorizado conectado",
            });
            await this.moduloService.recordDeviceConnectionAudit(moduloId, {
              fingerprint: normalizedFingerprint,
              cpuSerial: String(deviceIdentity?.cpu_serial ?? "").trim(),
              machineId: String(deviceIdentity?.machine_id ?? "").trim(),
              primaryMac: String(deviceIdentity?.primary_mac ?? "").trim(),
              ipAddress: this.getRemoteAddress(socket),
              locationLabel: String(deviceIdentity?.location_label ?? "").trim(),
              socketId: socket.id,
              status: "APPROVED",
              reason: "Dispositivo autorizado y conexion registrada",
            });
            this.deviceSessions.set(socket.id, {
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
              issuedDeviceSecret: Boolean(
                registrationResult.issuedDeviceSecret,
              ),
            });
            callback?.({
              ok: true,
              deviceSecret: registrationResult.issuedDeviceSecret,
            });
          } catch (error) {
            const normalizedFingerprint = String(
              deviceFingerprint ?? "",
            ).trim().toLowerCase();
            const moduloIdFromClient = String(moduleId ?? "").trim();
            const moduloIdFromSession =
              typeof socket.data.moduloId === "string"
                ? socket.data.moduloId
                : "";
            const fallbackModuloId = moduloIdFromSession || moduloIdFromClient;

            if (error instanceof CustomError) {
              const sessionStatus = this.resolveSessionStatusFromErrorCode(
                error.code,
              );
              if (fallbackModuloId && normalizedFingerprint) {
                await this.moduloService.updateDeviceRuntime(fallbackModuloId, {
                  fingerprint: normalizedFingerprint,
                  socketId: socket.id,
                  ipAddress: this.getRemoteAddress(socket),
                  locationLabel: String(
                    deviceIdentity?.location_label ?? "",
                  ).trim(),
                  connectionStatus: this.resolveRuntimeStatusFromErrorCode(
                    error.code,
                  ),
                  isConnected: false,
                  isAuthorized: false,
                  lastDisconnectAt: new Date(),
                  message: error.message,
                });
                await this.moduloService.recordDeviceConnectionAudit(
                  fallbackModuloId,
                  {
                    fingerprint: normalizedFingerprint,
                    cpuSerial: String(deviceIdentity?.cpu_serial ?? "").trim(),
                    machineId: String(deviceIdentity?.machine_id ?? "").trim(),
                    primaryMac: String(deviceIdentity?.primary_mac ?? "").trim(),
                    ipAddress: this.getRemoteAddress(socket),
                    locationLabel: String(
                      deviceIdentity?.location_label ?? "",
                    ).trim(),
                    socketId: socket.id,
                    status: sessionStatus,
                    reason: error.message,
                  },
                );
                this.deviceSessions.set(socket.id, {
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
        },
      );

      socket.on(
        "deviceHeartbeat",
        async (
          {
            moduleToken,
            moduleId,
            deviceFingerprint,
            deviceIdentity,
            deviceSecret,
          }: {
            moduleToken?: string;
            moduleId?: string;
            deviceFingerprint?: string;
            deviceIdentity?: DeviceIdentityPayload;
            deviceSecret?: string;
          },
          callback?: (response: OpenBarrierResponse) => void,
        ) => {
          try {
            if (!moduleToken) {
              callback?.({ ok: false, error: "moduleToken is required" });
              return;
            }

            const moduloId = await this.getModuloIdFromToken(moduleToken);
            const normalizedModuleId = String(moduleId ?? "").trim();
            const normalizedFingerprint = String(
              deviceFingerprint ?? "",
            ).trim().toLowerCase();

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
              cpuSerial: String(deviceIdentity?.cpu_serial ?? "").trim(),
              machineId: String(deviceIdentity?.machine_id ?? "").trim(),
              primaryMac: String(deviceIdentity?.primary_mac ?? "").trim(),
              ipAddress: this.getRemoteAddress(socket),
              locationLabel: String(deviceIdentity?.location_label ?? "").trim(),
              deviceSecret: String(deviceSecret ?? "").trim(),
              socketId: socket.id,
              message: "Heartbeat autorizado recibido",
            });

            const approvedSession = this.deviceSessions.get(socket.id);
            if (approvedSession) {
              approvedSession.lastSeenAt = new Date();
            }

            callback?.({ ok: true });
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Heartbeat invalido";
            const errorCode =
              error instanceof CustomError ? error.code : undefined;

            if (error instanceof CustomError) {
              const moduloId =
                typeof socket.data.moduloId === "string"
                  ? socket.data.moduloId
                  : String(moduleId ?? "").trim();
              const fingerprint = String(deviceFingerprint ?? "").trim().toLowerCase();
              if (moduloId && fingerprint) {
                await this.moduloService.updateDeviceRuntime(moduloId, {
                  fingerprint,
                  socketId: socket.id,
                  ipAddress: this.getRemoteAddress(socket),
                  locationLabel: String(
                    deviceIdentity?.location_label ?? "",
                  ).trim(),
                  connectionStatus: "MISMATCH",
                  isConnected: false,
                  isAuthorized: false,
                  lastDisconnectAt: new Date(),
                  message,
                });
              }
            }

            this.deviceSessions.delete(socket.id);
            const currentModuloId =
              typeof socket.data.moduloId === "string"
                ? socket.data.moduloId
                : "";
            if (
              currentModuloId &&
              this.authorizedDevices.get(currentModuloId)?.socketId === socket.id
            ) {
              this.authorizedDevices.delete(currentModuloId);
            }
            socket.data.deviceApproved = false;
            callback?.({ ok: false, error: message, code: errorCode });
            socket.disconnect(true);
          }
        },
      );

      socket.on("disconnect", () => {
        const moduloId = socket.data.moduloId as string | undefined;
        const runtimeStatus = this.resolveDisconnectRuntimeStatus(socket.id);
        const disconnectFingerprint =
          typeof socket.data.deviceFingerprint === "string"
            ? socket.data.deviceFingerprint
            : "";
        const approvedFlag = Boolean(socket.data.deviceApproved);

        if (moduloId) {
          const authorizedConnection = this.authorizedDevices.get(moduloId);
          if (authorizedConnection?.socketId === socket.id) {
            this.authorizedDevices.delete(moduloId);
          }
          this.deviceSessions.delete(socket.id);
          void this.moduloService.updateDeviceRuntime(moduloId, {
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
          this.deviceSessions.delete(socket.id);
        }

        console.log(`Socket disconnected: ${socket.id}`);
      });
    });

    return io;
  }

  static async openBarrier(moduloId: string): Promise<void> {
    if (!this.io) {
      throw CustomError.internalServer("Socket server no inicializado");
    }

    const authorizedConnection = this.authorizedDevices.get(moduloId);

    if (!authorizedConnection) {
      if (envs.BARRIER_SOCKET_REQUIRED) {
        console.warn("Open barrier rejected: no authorized device connected", {
          moduloId,
        });
        throw CustomError.badRequest("El modulo no tiene un dispositivo autorizado conectado");
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

    const approvedSession = this.deviceSessions.get(authorizedConnection.socketId);
    if (!approvedSession || approvedSession.status !== "APPROVED") {
      this.authorizedDevices.delete(moduloId);
      console.warn("Open barrier rejected: authorized session missing or not approved", {
        moduloId,
        socketId: authorizedConnection.socketId,
        sessionStatus: approvedSession?.status ?? null,
      });
      throw CustomError.forbidden(
        "La sesion del dispositivo no esta aprobada",
        { moduloId, socketId: authorizedConnection.socketId },
        "AUTHORIZED_SESSION_NOT_APPROVED",
      );
    }

    approvedSession.lastSeenAt = new Date();

    console.log("Open barrier authorized connection validated:", {
      moduloId,
      socketId: authorizedConnection.socketId,
      fingerprint: authorizedConnection.fingerprint,
    });

    const socketId = authorizedConnection.socketId;
    const socket = this.io.sockets.sockets.get(socketId);

    if (!socket) {
      this.authorizedDevices.delete(moduloId);

      if (envs.BARRIER_SOCKET_REQUIRED) {
        console.warn("Open barrier rejected: authorized socket not available", {
          moduloId,
          socketId,
        });
        throw CustomError.badRequest("El dispositivo autorizado ya no esta conectado");
      }

      console.warn(
        `Socket autorizado ${socketId} no disponible para modulo ${moduloId}`,
      );
      return;
    }

    const response = await this.emitOpenBarrier(socket);

    if (!response.ok) {
      console.warn("Open barrier rejected by device response:", {
        moduloId,
        socketId,
        response,
      });
      throw CustomError.badRequest(
        response.error ?? "No se pudo abrir la barrera",
      );
    }

    console.log("Open barrier succeeded:", {
      moduloId,
      socketId,
    });
  }

  static emitDeviceBindingUpdated(
    payload: DeviceBindingUpdatedPayload,
  ): void {
    if (!this.io) {
      return;
    }

    this.io.to("Modulos").emit("deviceBindingUpdated", payload);
    console.log("deviceBindingUpdated emitted:", payload);
  }

  private static emitOpenBarrier(socket: Socket): Promise<OpenBarrierResponse> {
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

  private static getHandshakeToken(socket: Socket): string {
    const headerToken = socket.handshake.headers["x-token"];
    const authToken = socket.handshake.auth?.token;

    if (typeof headerToken === "string") return headerToken.trim();
    if (typeof authToken === "string") return authToken.trim();

    return "";
  }

  private static getRemoteAddress(socket: Socket): string {
    const forwardedFor = socket.handshake.headers["x-forwarded-for"];
    const candidate =
      typeof forwardedFor === "string"
        ? forwardedFor.split(",")[0]
        : socket.handshake.address;

    return String(candidate ?? "").trim();
  }

  private static async getModuloIdFromToken(
    moduleToken: string,
  ): Promise<string> {
    const payload = await JwtPlugin.validateToken(moduleToken);

    if (!payload || typeof payload !== "object") {
      throw new Error("Invalid moduleToken");
    }

    const moduloId =
      "id" in payload
        ? String(payload.id)
        : "uid" in payload
          ? String(payload.uid)
          : "";

    if (!moduloId) {
      throw new Error("Invalid moduleToken");
    }

    return moduloId;
  }

  private static async assertAuthorizedConnection(
    moduloId: string,
    socketId: string,
    fingerprint: string,
  ): Promise<void> {
    const modulo = await this.moduloService.getModuloById(moduloId);
    const approvedFingerprint = String(
      modulo.deviceBinding?.fingerprint ?? "",
    ).trim().toLowerCase();

    if (!approvedFingerprint) {
      this.authorizedDevices.delete(moduloId);
      console.warn("Authorized connection invalidated: module has no approved device", {
        moduloId,
        socketId,
        fingerprint,
      });
      throw CustomError.forbidden(
        "El modulo no tiene un dispositivo aprobado",
        { moduloId, socketId },
        "MODULE_HAS_NO_APPROVED_DEVICE",
      );
    }

    if (approvedFingerprint !== fingerprint) {
      this.authorizedDevices.delete(moduloId);
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

    const approvedSession = this.deviceSessions.get(socketId);
    if (
      approvedSession &&
      Date.now() - approvedSession.lastSeenAt.getTime() > DEVICE_HEARTBEAT_TIMEOUT_MS
    ) {
      this.authorizedDevices.delete(moduloId);
      this.deviceSessions.delete(socketId);
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

  private static resolveSessionStatusFromErrorCode(
    errorCode?: string,
  ): DeviceConnectionStatus {
    if (errorCode === "DEVICE_BINDING_PENDING_APPROVAL") {
      return "PENDING";
    }

    if (errorCode === "MODULE_ALREADY_CONNECTED_PENDING_APPROVAL") {
      return "PENDING";
    }

    return "REJECTED";
  }

  private static resolveRuntimeStatusFromErrorCode(
    errorCode?: string,
  ): DeviceRuntimeConnectionStatus {
    if (
      errorCode === "DEVICE_BINDING_PENDING_APPROVAL" ||
      errorCode === "MODULE_ALREADY_CONNECTED_PENDING_APPROVAL"
    ) {
      return "PENDING";
    }

    if (
      errorCode === "DEVICE_SECRET_INVALID" ||
      errorCode === "AUTHORIZED_DEVICE_MISMATCH" ||
      errorCode === "AUTHORIZED_HEARTBEAT_MISMATCH"
    ) {
      return "MISMATCH";
    }

    return "REJECTED";
  }

  private static resolveDisconnectRuntimeStatus(
    socketId: string,
  ): DeviceRuntimeConnectionStatus {
    const session = this.deviceSessions.get(socketId);
    if (!session) {
      return "DISCONNECTED";
    }

    if (session.status === "PENDING") {
      return "PENDING";
    }

    if (session.status === "REJECTED") {
      return "REJECTED";
    }

    return "DISCONNECTED";
  }

  private static startStaleSessionMonitor() {
    if (this.staleSessionMonitorStarted) {
      return;
    }

    this.staleSessionMonitorStarted = true;

    setInterval(() => {
      void this.expireStaleSessions();
    }, STALE_SESSION_SCAN_INTERVAL_MS);
    console.log(
      `Device heartbeat monitor started. Interval=${DEVICE_HEARTBEAT_INTERVAL_MS}ms timeout=${DEVICE_HEARTBEAT_TIMEOUT_MS}ms`,
    );
  }

  private static async expireStaleSessions() {
    const now = Date.now();

    for (const session of this.deviceSessions.values()) {
      if (session.status !== "APPROVED") {
        continue;
      }

      if (now - session.lastSeenAt.getTime() <= DEVICE_HEARTBEAT_TIMEOUT_MS) {
        continue;
      }

      this.deviceSessions.delete(session.socketId);
      const authorizedConnection = this.authorizedDevices.get(session.moduloId);
      if (authorizedConnection?.socketId === session.socketId) {
        this.authorizedDevices.delete(session.moduloId);
      }

      await this.moduloService.updateDeviceRuntime(session.moduloId, {
        fingerprint: session.fingerprint,
        socketId: session.socketId,
        connectionStatus: "DISCONNECTED",
        isConnected: false,
        isAuthorized: true,
        lastDisconnectAt: new Date(),
        message: "La sesion expiro por falta de heartbeat",
      });

      const socket = this.io?.sockets.sockets.get(session.socketId);
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
}

function createModuloService(): ModuloService {
  return new ModuloService(
    new ModuloRepositoryImpl(new ModuloMongoDatasource()),
    new ProyectoRepositoryImpl(new ProyectoMongoDatasource()),
  );
}
