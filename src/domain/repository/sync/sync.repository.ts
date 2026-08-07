import type { UserAppAccess } from "../../constants";
import type {
  HeartbeatSnapshotPayload,
  InboxEventPayload,
  InstallationLinkRequestPayload,
} from "../../datasources/sync/sync.datasource";

export abstract class SyncRepository {
  abstract getConfiguration(proyectoId: string): Promise<any>;

  abstract getProjectsCatalog(): Promise<any[]>;

  abstract getAccessSnapshot(proyectoId: string): Promise<any>;

  abstract getAccessUserByCorreo(
    correo: string,
    app: UserAppAccess,
  ): Promise<any>;

  abstract getAccessUserByTelefono(
    telefono: string,
    app: UserAppAccess,
  ): Promise<any>;

  abstract requestInstallationLink(
    payload: InstallationLinkRequestPayload,
  ): Promise<any>;

  abstract getInstallationRequestStatus(installationId: string): Promise<any>;

  abstract receiveHeartbeatSnapshot(
    payload: HeartbeatSnapshotPayload,
  ): Promise<any>;

  abstract receiveEvent(payload: InboxEventPayload): Promise<any>;
}
