import { PostgresDatabase } from "../../../data/postgres";
import { Prisma } from "../../../generated/prisma/client";
import { PushDatasource, type PushProject, type PushSubscriptionInput, type PushTarget } from "../../../domain/datasources/push/push.datasource";
import { isUuid } from "../postgres/prisma-errors";

export class PushPostgresDatasource extends PushDatasource {
  private get db() {
    return PostgresDatabase.client;
  }

  async saveSubscription(input: PushSubscriptionInput) {
    const data = { usuarioId: input.usuarioId, p256dh: input.p256dh, auth: input.auth, userAgent: input.userAgent };
    await this.db.pushSubscription.upsert({ where: { endpoint: input.endpoint }, create: { endpoint: input.endpoint, ...data }, update: data });
  }

  async deleteSubscription(usuarioId: string, endpoint: string) {
    if (!isUuid(usuarioId)) return false;
    return (await this.db.pushSubscription.deleteMany({ where: { usuarioId, endpoint } })).count > 0;
  }

  countSubscriptions(usuarioId: string) {
    return isUuid(usuarioId) ? this.db.pushSubscription.count({ where: { usuarioId } }) : Promise.resolve(0);
  }

  async listProjects(projectIds: string[] | null): Promise<PushProject[]> {
    const ids = projectIds?.filter(isUuid) ?? null;
    if (ids && !ids.length) return [];
    const rows = await this.db.proyecto.findMany({
      where: { estado: true, ...(ids ? { id: { in: ids } } : {}) },
      select: { id: true, nombre: true, zonaHoraria: true },
      orderBy: [{ nombre: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => ({ proyectoId: row.id, nombre: row.nombre, zonaHoraria: row.zonaHoraria }));
  }

  async mutedProjects(usuarioId: string) {
    if (!isUuid(usuarioId)) return [];
    return (await this.db.pushMutedProject.findMany({ where: { usuarioId }, select: { proyectoId: true } })).map((row) => row.proyectoId);
  }

  async setMuted(usuarioId: string, proyectoId: string, muted: boolean) {
    if (!isUuid(usuarioId) || !isUuid(proyectoId)) return;
    if (muted) {
      await this.db.pushMutedProject.createMany({ data: [{ usuarioId, proyectoId }], skipDuplicates: true });
    } else {
      await this.db.pushMutedProject.deleteMany({ where: { usuarioId, proyectoId } });
    }
  }

  async targetsForProject(proyectoId: string): Promise<PushTarget[]> {
    if (!isUuid(proyectoId)) return [];
    return this.db.$queryRaw<PushTarget[]>(Prisma.sql`
      SELECT s.endpoint, s.p256dh, s.auth
      FROM push_subscriptions s JOIN usuarios u ON u.id = s.usuario_id
      WHERE u.estado AND 'ADMIN_WEB' = ANY(u.allowed_apps)
        AND NOT EXISTS (SELECT 1 FROM push_muted_projects m WHERE m.usuario_id = u.id AND m.proyecto_id = ${proyectoId}::uuid)
        AND (u.rol = 'SUPER_ROLE' OR (
          EXISTS (SELECT 1 FROM usuario_parkings up WHERE up.usuario_id = u.id AND up.proyecto_id = ${proyectoId}::uuid)
          AND EXISTS (
            SELECT 1 FROM usuario_app_permissions ap JOIN permission_profiles pp ON pp.id = ap.permission_profile_id
            WHERE ap.usuario_id = u.id AND ap.app = 'ADMIN_WEB' AND pp.estado
              AND pp.modules && ARRAY['projects', 'installations']::user_module[])))`);
  }

  async markDelivered(endpoints: string[], at: number) {
    if (endpoints.length) await this.db.pushSubscription.updateMany({ where: { endpoint: { in: endpoints } }, data: { lastSuccessAt: new Date(at) } });
  }

  async removeEndpoints(endpoints: string[]) {
    if (endpoints.length) await this.db.pushSubscription.deleteMany({ where: { endpoint: { in: endpoints } } });
  }
}
