import type { PushDatasource, PushSubscriptionInput } from "../../../domain/datasources/push/push.datasource";
import { PushRepository } from "../../../domain/repositories/push/push.repository";

export class PushRepositoryImpl implements PushRepository {
  constructor(private readonly datasource: PushDatasource) {}

  saveSubscription(input: PushSubscriptionInput) {
    return this.datasource.saveSubscription(input);
  }

  deleteSubscription(usuarioId: string, endpoint: string) {
    return this.datasource.deleteSubscription(usuarioId, endpoint);
  }

  countSubscriptions(usuarioId: string) {
    return this.datasource.countSubscriptions(usuarioId);
  }

  listProjects(projectIds: string[] | null) {
    return this.datasource.listProjects(projectIds);
  }

  mutedProjects(usuarioId: string) {
    return this.datasource.mutedProjects(usuarioId);
  }

  setMuted(usuarioId: string, proyectoId: string, muted: boolean) {
    return this.datasource.setMuted(usuarioId, proyectoId, muted);
  }

  targetsForProject(proyectoId: string) {
    return this.datasource.targetsForProject(proyectoId);
  }

  markDelivered(endpoints: string[], at: number) {
    return this.datasource.markDelivered(endpoints, at);
  }

  removeEndpoints(endpoints: string[]) {
    return this.datasource.removeEndpoints(endpoints);
  }
}
