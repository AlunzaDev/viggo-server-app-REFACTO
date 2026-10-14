import type { UserAppAccess } from "../../../domain/constants";
import type {
  HeartbeatSnapshotPayload,
  InboxEventPayload,
  InstallationLinkRequestPayload,
  SyncDatasource,
} from "../../../domain/datasources/sync/sync.datasource";
import { SyncRepository } from "../../../domain/repositories/sync/sync.repository";

export class SyncRepositoryImpl implements SyncRepository {
  constructor(private readonly datasource: SyncDatasource) {}

  getConfiguration(proyectoId: string) {
    return this.datasource.getConfiguration(proyectoId);
  }

  findProjectByLinkToken(token: string) {
    return this.datasource.findProjectByLinkToken(token);
  }

  getAccessSnapshot(proyectoId: string) {
    return this.datasource.getAccessSnapshot(proyectoId);
  }

  getAccessUserByCorreo(correo: string, app: UserAppAccess, proyectoId: string) {
    return this.datasource.getAccessUserByCorreo(correo, app, proyectoId);
  }

  getAccessUserByTelefono(telefono: string, app: UserAppAccess, proyectoId: string) {
    return this.datasource.getAccessUserByTelefono(telefono, app, proyectoId);
  }

  requestInstallationLink(payload: InstallationLinkRequestPayload) {
    return this.datasource.requestInstallationLink(payload);
  }

  getInstallationRequestStatus(installationId: string, proyectoId: string) {
    return this.datasource.getInstallationRequestStatus(installationId, proyectoId);
  }

  receiveHeartbeatSnapshot(payload: HeartbeatSnapshotPayload) {
    return this.datasource.receiveHeartbeatSnapshot(payload);
  }

  receiveEvent(payload: InboxEventPayload) {
    return this.datasource.receiveEvent(payload);
  }
}
