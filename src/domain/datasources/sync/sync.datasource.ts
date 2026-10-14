import type { UserAppAccess } from "../../constants";

/** Project a link token belongs to, shown to the operator before linking. */
export type LinkTokenProject = {
  id: string;
  nombre: string;
  identificador: string;
  codigoProyecto: string;
  ciudad: string;
};

export type InstallationLinkRequestPayload = {
  installationId: string;
  /** Derived from the link token the installation authenticated with. */
  proyectoId: string;
  localApiBaseUrl: string;
  serverIp: string;
  serverMac: string;
  browserCoordinates?: [number, number];
  browserLocationAccuracy?: number;
  browserLocationCapturedAt?: number;
  requestedByUserId: string;
  requestedByUserName: string;
};

export type InboxEventPayload = {
  eventId: string;
  installationId: string;
  proyectoId: string;
  eventType: string;
  aggregateId: string;
  occurredAt: number;
  sourcePosition?: string;
  payload: object;
};

export type HeartbeatSnapshotPayload = {
  installationId: string;
  proyectoId: string;
  generatedAt: number;
  source: string;
  summary: Record<string, unknown>;
  modules: Array<Record<string, unknown>>;
  metadata?: Record<string, unknown>;
};

export abstract class SyncDatasource {
  abstract getConfiguration(proyectoId: string): Promise<any>;

  /** The project whose installation link token is `token`, if any. */
  abstract findProjectByLinkToken(token: string): Promise<LinkTokenProject | null>;

  abstract getAccessSnapshot(proyectoId: string): Promise<any>;

  /** Only users that may operate `proyectoId` (assigned parking or SUPER_ROLE). */
  abstract getAccessUserByCorreo(
    correo: string,
    app: UserAppAccess,
    proyectoId: string,
  ): Promise<any>;

  abstract getAccessUserByTelefono(
    telefono: string,
    app: UserAppAccess,
    proyectoId: string,
  ): Promise<any>;

  abstract requestInstallationLink(
    payload: InstallationLinkRequestPayload,
  ): Promise<any>;

  /**
   * Link request of the installation for `proyectoId`. Once approved it carries a new sync
   * token for the installation (only its hash is stored); asking again issues a new one.
   */
  abstract getInstallationRequestStatus(installationId: string, proyectoId: string): Promise<any>;

  abstract receiveHeartbeatSnapshot(
    payload: HeartbeatSnapshotPayload,
  ): Promise<any>;

  abstract receiveEvent(payload: InboxEventPayload): Promise<any>;
}
