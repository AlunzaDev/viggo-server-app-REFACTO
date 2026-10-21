import type {
  TicketLabInstallation,
  TicketLabModule,
  TicketLabPayment,
  TicketLabProject,
  TicketLabTicketOperation,
  TicketLabUser,
} from "../../datasources/dev/ticket-lab.datasource";

export abstract class TicketLabRepository {
  abstract activeUsers(): Promise<TicketLabUser[]>;
  abstract activeModules(): Promise<TicketLabModule[]>;
  abstract projects(): Promise<TicketLabProject[]>;
  abstract approvedInstallations(): Promise<TicketLabInstallation[]>;
  abstract recentPayments(userId: string, limit: number): Promise<TicketLabPayment[]>;
  abstract findUser(id: string): Promise<TicketLabUser | null>;
  abstract findModule(id: string): Promise<TicketLabModule | null>;
  abstract findProject(id: string): Promise<TicketLabProject | null>;
  abstract createTicketOperation(operation: TicketLabTicketOperation): Promise<void>;
}
