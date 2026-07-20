import { Server as HttpServer } from "http";
import { Server as SocketServer, Socket } from "socket.io";
import { JwtPlugin } from "../../config/plugins/jwt.plugin";
import { ModuloMongoDatasource } from "../../infrastructure/datasources/parking/modulo.datasource.mongo";
import { ProyectoMongoDatasource } from "../../infrastructure/datasources/parking/proyecto.datasource.mongo";
import { ModuloRepositoryImpl } from "../../infrastructure/repositories/parking/modulo.repository.impl";
import { ProyectoRepositoryImpl } from "../../infrastructure/repositories/parking/proyecto.repository.impl";
import { ModuloService } from "../services/parking/modulo.service";
import { DeviceSessionRegistry } from "./device-session-registry";
import { DeviceSocketService } from "./device-socket.service";
import {
  DEVICE_HEARTBEAT_INTERVAL_MS,
  DeviceBindingUpdatedPayload,
  OpenBarrierResponse,
  STALE_SESSION_SCAN_INTERVAL_MS,
} from "./device-socket.types";

export class SocketServerPlugin {
  private static io?: SocketServer;
  private static moduloService = createModuloService();
  private static registry = new DeviceSessionRegistry();
  private static deviceSocketService = new DeviceSocketService(
    this.moduloService,
    this.registry,
  );
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

      socket.on("registrarDispositivo", async (payload, callback) => {
        await this.deviceSocketService.handleDeviceRegistration(
          socket,
          payload,
          callback as ((response: OpenBarrierResponse) => void) | undefined,
        );
      });

      socket.on("deviceHeartbeat", async (payload, callback) => {
        await this.deviceSocketService.handleDeviceHeartbeat(
          socket,
          payload,
          callback as ((response: OpenBarrierResponse) => void) | undefined,
        );
      });

      socket.on("disconnect", () => {
        void this.deviceSocketService.handleDisconnect(socket);
      });
    });

    return io;
  }

  static async openBarrier(moduloId: string): Promise<void> {
    await this.deviceSocketService.openBarrier(this.io, moduloId);
  }

  static emitDeviceBindingUpdated(payload: DeviceBindingUpdatedPayload): void {
    this.deviceSocketService.emitDeviceBindingUpdated(this.io, payload);
  }

  private static getHandshakeToken(socket: Socket): string {
    const headerToken = socket.handshake.headers["x-token"];
    const authToken = socket.handshake.auth?.token;

    if (typeof headerToken === "string") return headerToken.trim();
    if (typeof authToken === "string") return authToken.trim();

    return "";
  }

  private static startStaleSessionMonitor() {
    if (this.staleSessionMonitorStarted) {
      return;
    }

    this.staleSessionMonitorStarted = true;

    setInterval(() => {
      void this.deviceSocketService.expireStaleSessions(this.io);
    }, STALE_SESSION_SCAN_INTERVAL_MS);
    console.log(
      `Device heartbeat monitor started. Interval=${DEVICE_HEARTBEAT_INTERVAL_MS}ms timeout monitor active`,
    );
  }
}

function createModuloService(): ModuloService {
  return new ModuloService(
    new ModuloRepositoryImpl(new ModuloMongoDatasource()),
    new ProyectoRepositoryImpl(new ProyectoMongoDatasource()),
  );
}
