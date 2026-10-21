// Development-only ticket laboratory (mounted when PROD=false): what it reads and writes.

export interface TicketLabUser {
  id: string;
  nombre: string;
  correo: string;
}

export interface TicketLabModule {
  id: string;
  nombre: string;
  tipo: string;
  proyectoId: string;
}

export interface TicketLabProject {
  id: string;
  nombre: string;
  ciudad: string;
  /** [lon, lat] or a polygon, as stored. */
  coordinates: unknown;
  estado: boolean;
  paymentProviderId: string;
  paymentProviderName: string;
}

export interface TicketLabInstallation {
  installationId: string;
  proyectoId: string;
  lastCommandPollAt: number | null;
}

export interface TicketLabPayment {
  id: string;
  concept: string;
  amount: number;
  currency: string;
  status: string;
  paidAt: number;
  parkingName: string;
  parkingCity: string;
  referenceId: string;
  reconciliationStatus: string;
}

/** A completed CREATE_TICKET mobile operation: the app reads its current ticket from it. */
export interface TicketLabTicketOperation {
  ticketId: string;
  installationId: string;
  proyectoId: string;
  usuarioId: string;
  moduleId: string;
  /** The installation belongs to another parking (none approved in this one). */
  devInstallationBridge: boolean;
  ticket: Record<string, unknown>;
  completedAt: number;
}

export abstract class TicketLabDatasource {
  abstract activeUsers(): Promise<TicketLabUser[]>;
  abstract activeModules(): Promise<TicketLabModule[]>;
  abstract projects(): Promise<TicketLabProject[]>;
  /** Approved installations, oldest first. */
  abstract approvedInstallations(): Promise<TicketLabInstallation[]>;
  abstract recentPayments(userId: string, limit: number): Promise<TicketLabPayment[]>;
  abstract findUser(id: string): Promise<TicketLabUser | null>;
  abstract findModule(id: string): Promise<TicketLabModule | null>;
  abstract findProject(id: string): Promise<TicketLabProject | null>;
  abstract createTicketOperation(operation: TicketLabTicketOperation): Promise<void>;
}
