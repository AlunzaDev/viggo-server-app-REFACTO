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
}

interface DeviceIdentityPayload {
  cpu_serial?: string;
  machine_id?: string;
  primary_mac?: string;
}

export class SocketServerPlugin {
  private static io?: SocketServer;
  private static connectedDevices = new Map<string, string>();
  private static moduloService = createModuloService();

  static init(httpServer: HttpServer) {
    const io = new SocketServer(httpServer, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
      },
      transports: ["polling", "websocket"],
    });

    this.io = io;

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
          }: {
            moduleToken?: string;
            moduleId?: string;
            deviceFingerprint?: string;
            deviceIdentity?: DeviceIdentityPayload;
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
            });

            await this.moduloService.validateDeviceRegistration(moduloId, {
              fingerprint: String(deviceFingerprint ?? "").trim(),
              cpuSerial: String(deviceIdentity?.cpu_serial ?? "").trim(),
              machineId: String(deviceIdentity?.machine_id ?? "").trim(),
              primaryMac: String(deviceIdentity?.primary_mac ?? "").trim(),
            });

            this.connectedDevices.set(moduloId, socket.id);
            socket.data.moduloId = moduloId;

            console.log(`Modulo ${moduloId} registered on socket ${socket.id}`);
            callback?.({ ok: true });
          } catch (error) {
            if (error instanceof CustomError) {
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

      socket.on("disconnect", () => {
        const moduloId = socket.data.moduloId as string | undefined;

        if (moduloId) {
          this.connectedDevices.delete(moduloId);
          console.log(`Modulo ${moduloId} disconnected`);
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

    const socketId = this.connectedDevices.get(moduloId);

    if (!socketId) {
      if (envs.BARRIER_SOCKET_REQUIRED) {
        throw CustomError.badRequest("El modulo no esta conectado");
      }

      console.warn(
        `Modulo ${moduloId} no conectado. BARRIER_SOCKET_REQUIRED=false`,
      );
      return;
    }

    const socket = this.io.sockets.sockets.get(socketId);

    if (!socket) {
      this.connectedDevices.delete(moduloId);

      if (envs.BARRIER_SOCKET_REQUIRED) {
        throw CustomError.badRequest("El modulo no esta conectado");
      }

      console.warn(`Socket ${socketId} no disponible para modulo ${moduloId}`);
      return;
    }

    const response = await this.emitOpenBarrier(socket);

    if (!response.ok) {
      throw CustomError.badRequest(
        response.error ?? "No se pudo abrir la barrera",
      );
    }
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
}

function createModuloService(): ModuloService {
  return new ModuloService(
    new ModuloRepositoryImpl(new ModuloMongoDatasource()),
    new ProyectoRepositoryImpl(new ProyectoMongoDatasource()),
  );
}
