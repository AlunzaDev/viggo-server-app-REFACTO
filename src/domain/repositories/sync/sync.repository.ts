import type { UserAppAccess } from "../../constants";
import type {
  HeartbeatSnapshotPayload,
  InboxEventPayload,
  InstallationLinkRequestPayload,
  LinkTokenProject,
} from "../../datasources/sync/sync.datasource";

export abstract class SyncRepository {
  abstract getConfiguration(proyectoId: string): Promise<any>;

  abstract findProjectByLinkToken(token: string): Promise<LinkTokenProject | null>;

  abstract getAccessSnapshot(proyectoId: string): Promise<any>;

  abstract getAccessUserByCorreo(correo: string, app: UserAppAccess, proyectoId: string): Promise<any>;

  abstract getAccessUserByTelefono(telefono: string, app: UserAppAccess, proyectoId: string): Promise<any>;

  abstract requestInstallationLink(
    payload: InstallationLinkRequestPayload,
  ): Promise<any>;

  abstract getInstallationRequestStatus(installationId: string, proyectoId: string): Promise<any>;

  abstract receiveHeartbeatSnapshot(
    payload: HeartbeatSnapshotPayload,
  ): Promise<any>;

  abstract receiveEvent(payload: InboxEventPayload): Promise<any>;
}
