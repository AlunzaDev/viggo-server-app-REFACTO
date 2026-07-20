import {
  AuthorizedDeviceConnection,
  DeviceConnectionSession,
  DeviceConnectionStatus,
  DeviceRuntimeConnectionStatus,
} from "./device-socket.types";

export class DeviceSessionRegistry {
  private readonly authorizedDevices = new Map<
    string,
    AuthorizedDeviceConnection
  >();
  private readonly deviceSessions = new Map<string, DeviceConnectionSession>();

  hasAuthorizedDevice(moduloId: string): boolean {
    return this.authorizedDevices.has(moduloId);
  }

  getAuthorizedConnection(
    moduloId: string,
  ): AuthorizedDeviceConnection | undefined {
    return this.authorizedDevices.get(moduloId);
  }

  setAuthorizedConnection(
    moduloId: string,
    connection: AuthorizedDeviceConnection,
  ): void {
    this.authorizedDevices.set(moduloId, connection);
  }

  deleteAuthorizedConnection(moduloId: string): void {
    this.authorizedDevices.delete(moduloId);
  }

  deleteAuthorizedConnectionIfMatches(moduloId: string, socketId: string): void {
    if (this.authorizedDevices.get(moduloId)?.socketId === socketId) {
      this.authorizedDevices.delete(moduloId);
    }
  }

  setSession(session: DeviceConnectionSession): void {
    this.deviceSessions.set(session.socketId, session);
  }

  getSession(socketId: string): DeviceConnectionSession | undefined {
    return this.deviceSessions.get(socketId);
  }

  touchSession(socketId: string, date = new Date()): void {
    const session = this.deviceSessions.get(socketId);
    if (session) {
      session.lastSeenAt = date;
    }
  }

  deleteSession(socketId: string): void {
    this.deviceSessions.delete(socketId);
  }

  getSessions(): IterableIterator<DeviceConnectionSession> {
    return this.deviceSessions.values();
  }

  isAnotherActiveAuthorizedSocket(moduloId: string, socketId: string): boolean {
    return (
      this.authorizedDevices.has(moduloId) &&
      this.authorizedDevices.get(moduloId)?.socketId !== socketId
    );
  }

  resolveDisconnectRuntimeStatus(
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

  resolveSessionStatusFromErrorCode(
    errorCode?: string,
  ): DeviceConnectionStatus {
    if (
      errorCode === "DEVICE_BINDING_PENDING_APPROVAL" ||
      errorCode === "MODULE_ALREADY_CONNECTED_PENDING_APPROVAL"
    ) {
      return "PENDING";
    }

    return "REJECTED";
  }

  resolveRuntimeStatusFromErrorCode(
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
}
