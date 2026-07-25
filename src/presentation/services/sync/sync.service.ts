import type {
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

  getAccessUserByCorreo(correo: string) {
    return this.repository.getAccessUserByCorreo(correo);
  }

  getAccessUserByTelefono(telefono: string) {
    return this.repository.getAccessUserByTelefono(telefono);
  }

  requestInstallationLink(payload: InstallationLinkRequestPayload) {
    return this.repository.requestInstallationLink(payload);
  }

  getInstallationRequestStatus(installationId: string) {
    return this.repository.getInstallationRequestStatus(installationId);
  }

  receiveEvent(payload: InboxEventPayload) {
    return this.repository.receiveEvent(payload);
  }
}
