import type {
  HeartbeatSnapshotPayload,
  InboxEventPayload,
  InstallationLinkRequestPayload,
  SyncDatasource,
} from "../../../domain/datasources/sync/sync.datasource";
import { SyncRepository } from "../../../domain/repository/sync/sync.repository";

export class SyncRepositoryImpl implements SyncRepository {
  constructor(private readonly datasource: SyncDatasource) {}

  getConfiguration(proyectoId: string) {
    return this.datasource.getConfiguration(proyectoId);
  }

  getProjectsCatalog() {
    return this.datasource.getProjectsCatalog();
  }

  getAccessSnapshot(proyectoId: string) {
    return this.datasource.getAccessSnapshot(proyectoId);
  }

  getAccessUserByCorreo(correo: string) {
    return this.datasource.getAccessUserByCorreo(correo);
  }

  getAccessUserByTelefono(telefono: string) {
    return this.datasource.getAccessUserByTelefono(telefono);
  }

  requestInstallationLink(payload: InstallationLinkRequestPayload) {
    return this.datasource.requestInstallationLink(payload);
  }

  getInstallationRequestStatus(installationId: string) {
    return this.datasource.getInstallationRequestStatus(installationId);
  }

  receiveHeartbeatSnapshot(payload: HeartbeatSnapshotPayload) {
    return this.datasource.receiveHeartbeatSnapshot(payload);
  }

  receiveEvent(payload: InboxEventPayload) {
    return this.datasource.receiveEvent(payload);
  }
}
