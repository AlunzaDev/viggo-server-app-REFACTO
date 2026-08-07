import type { UserAppAccess } from "../../../domain/constants";
import type {
  HeartbeatSnapshotPayload,
  InboxEventPayload,
  InstallationLinkRequestPayload,
} from "../../../domain/datasources/sync/sync.datasource";
import { SyncRepository } from "../../../domain/repository/sync/sync.repository";

export class SyncService {
  constructor(private readonly repository: SyncRepository) {}

  getConfiguration(proyectoId: string) {
    return this.repository.getConfiguration(proyectoId);
  }

  getProjectsCatalog() {
    return this.repository.getProjectsCatalog();
  }

  getAccessSnapshot(proyectoId: string) {
    return this.repository.getAccessSnapshot(proyectoId);
  }

  getAccessUserByCorreo(correo: string, app: UserAppAccess) {
    return this.repository.getAccessUserByCorreo(correo, app);
  }

  getAccessUserByTelefono(telefono: string, app: UserAppAccess) {
    return this.repository.getAccessUserByTelefono(telefono, app);
  }

  requestInstallationLink(payload: InstallationLinkRequestPayload) {
    return this.repository.requestInstallationLink(payload);
  }

  getInstallationRequestStatus(installationId: string) {
    return this.repository.getInstallationRequestStatus(installationId);
  }

  receiveHeartbeatSnapshot(payload: HeartbeatSnapshotPayload) {
    return this.repository.receiveHeartbeatSnapshot(payload);
  }

  receiveEvent(payload: InboxEventPayload) {
    return this.repository.receiveEvent(payload);
  }
}
