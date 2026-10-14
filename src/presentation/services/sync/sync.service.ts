import type { UserAppAccess } from "../../../domain/constants";
import type {
  HeartbeatSnapshotPayload,
  InboxEventPayload,
  InstallationLinkRequestPayload,
} from "../../../domain/datasources/sync/sync.datasource";
import { SyncRepository } from "../../../domain/repositories/sync/sync.repository";

export class SyncService {
  constructor(private readonly repository: SyncRepository) {}

  getConfiguration(proyectoId: string) {
    return this.repository.getConfiguration(proyectoId);
  }

  findProjectByLinkToken(token: string) {
    return this.repository.findProjectByLinkToken(token);
  }

  getAccessSnapshot(proyectoId: string) {
    return this.repository.getAccessSnapshot(proyectoId);
  }

  getAccessUserByCorreo(correo: string, app: UserAppAccess, proyectoId: string) {
    return this.repository.getAccessUserByCorreo(correo, app, proyectoId);
  }

  getAccessUserByTelefono(telefono: string, app: UserAppAccess, proyectoId: string) {
    return this.repository.getAccessUserByTelefono(telefono, app, proyectoId);
  }

  requestInstallationLink(payload: InstallationLinkRequestPayload) {
    return this.repository.requestInstallationLink(payload);
  }

  getInstallationRequestStatus(installationId: string, proyectoId: string) {
    return this.repository.getInstallationRequestStatus(installationId, proyectoId);
  }

  receiveHeartbeatSnapshot(payload: HeartbeatSnapshotPayload) {
    return this.repository.receiveHeartbeatSnapshot(payload);
  }

  receiveEvent(payload: InboxEventPayload) {
    return this.repository.receiveEvent(payload);
  }
}
