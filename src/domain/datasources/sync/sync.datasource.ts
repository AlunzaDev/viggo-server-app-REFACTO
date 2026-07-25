export type InstallationLinkRequestPayload = {
  installationId: string;
  proyectoId: string;
  installationLinkToken: string;
  localApiBaseUrl: string;
  serverIp: string;
  serverMac: string;
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
  payload: object;
};

export abstract class SyncDatasource {
  abstract getConfiguration(proyectoId: string): Promise<any>;
  abstract getProjectsCatalog(): Promise<any[]>;
  abstract getAccessSnapshot(proyectoId: string): Promise<any>;
  abstract getAccessUserByCorreo(correo: string): Promise<any>;
  abstract getAccessUserByTelefono(telefono: string): Promise<any>;
  abstract requestInstallationLink(
    payload: InstallationLinkRequestPayload,
  ): Promise<any>;
  abstract getInstallationRequestStatus(installationId: string): Promise<any>;
  abstract receiveEvent(payload: InboxEventPayload): Promise<any>;
}
