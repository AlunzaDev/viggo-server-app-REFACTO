import type { TicketLabDatasource, TicketLabTicketOperation } from "../../../domain/datasources/dev/ticket-lab.datasource";
import { TicketLabRepository } from "../../../domain/repositories/dev/ticket-lab.repository";

export class TicketLabRepositoryImpl implements TicketLabRepository {
  constructor(private readonly datasource: TicketLabDatasource) {}

  activeUsers() {
    return this.datasource.activeUsers();
  }

  activeModules() {
    return this.datasource.activeModules();
  }

  projects() {
    return this.datasource.projects();
  }

  approvedInstallations() {
    return this.datasource.approvedInstallations();
  }

  recentPayments(userId: string, limit: number) {
    return this.datasource.recentPayments(userId, limit);
  }

  findUser(id: string) {
    return this.datasource.findUser(id);
  }

  findModule(id: string) {
    return this.datasource.findModule(id);
  }

  findProject(id: string) {
    return this.datasource.findProject(id);
  }

  createTicketOperation(operation: TicketLabTicketOperation) {
    return this.datasource.createTicketOperation(operation);
  }
}
