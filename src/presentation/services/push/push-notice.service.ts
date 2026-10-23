import { canAccessProject, type ProjectAccess } from "../../../domain/entities/auth/project-access";
import { CustomError } from "../../../domain/errors/custom.error";
import type { PushPayload, PushRepository, PushSender } from "../../../domain/repositories/push/push.repository";

const MAX_ENDPOINT_LENGTH = 2048;
const MAX_KEY_LENGTH = 256;
const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/;

export type InstallationChange = { proyectoId: string; online: boolean; at: number };

/** "14:05" in the parking's time zone; the date too when it is not the same day. */
const localTime = (at: number, zone: string, now: number) => {
  const day = (value: number) => new Intl.DateTimeFormat("es-MX", { timeZone: zone, dateStyle: "short" }).format(value);
  const time = new Intl.DateTimeFormat("es-MX", { timeZone: zone, hour: "2-digit", minute: "2-digit", hour12: false }).format(at);
  return day(at) === day(now) ? time : `${day(at)} ${time}`;
};

/**
 * Push notices to the administrators when an installation goes offline or comes back
 * (REFACTO#65), as SIKKOUNTER's "runner caído". Best effort: a failed notice never stops the
 * monitor that triggers it.
 */
export class PushNoticeService {
  /** Last notice per parking and kind, so a flapping installation does not flood the phones. */
  private readonly lastSent = new Map<string, number>();

  constructor(
    private readonly push: PushRepository,
    private readonly sender: PushSender,
    private readonly cooldownMs: number,
  ) {}

  config() {
    return { enabled: this.sender.enabled, publicKey: this.sender.enabled ? this.sender.publicKey : "" };
  }

  async subscribe(usuarioId: string, body: Record<string, unknown>, userAgent: string) {
    if (!this.sender.enabled) throw CustomError.serviceUnavailable("Los avisos no están configurados en el servidor");
    const endpoint = typeof body.endpoint === "string" ? body.endpoint.trim() : "";
    const keys = (body.keys ?? {}) as Record<string, unknown>;
    const p256dh = typeof keys.p256dh === "string" ? keys.p256dh.trim() : "";
    const auth = typeof keys.auth === "string" ? keys.auth.trim() : "";
    let url: URL | null = null;
    try {
      url = new URL(endpoint);
    } catch {
      url = null;
    }
    // Only an https push service URL and well-formed keys are stored.
    if (!url || url.protocol !== "https:" || endpoint.length > MAX_ENDPOINT_LENGTH) throw CustomError.badRequest("Suscripción inválida");
    for (const key of [p256dh, auth]) {
      if (!key || key.length > MAX_KEY_LENGTH || !BASE64URL.test(key)) throw CustomError.badRequest("Suscripción inválida");
    }
    await this.push.saveSubscription({ usuarioId, endpoint, p256dh, auth, userAgent: userAgent.slice(0, 300) });
    return { subscribed: true };
  }

  async unsubscribe(usuarioId: string, body: Record<string, unknown>) {
    const endpoint = typeof body.endpoint === "string" ? body.endpoint.trim() : "";
    if (!endpoint) throw CustomError.badRequest("Falta el endpoint");
    return { removed: await this.push.deleteSubscription(usuarioId, endpoint) };
  }

  /** The parkings the user can see, and whether each one notifies them. */
  async preferences(usuarioId: string, access: ProjectAccess) {
    const [projects, muted, subscriptions] = await Promise.all([
      this.push.listProjects(access.all ? null : access.allowed),
      this.push.mutedProjects(usuarioId),
      this.push.countSubscriptions(usuarioId),
    ]);
    const silenced = new Set(muted);
    return {
      ...this.config(),
      navegadores: subscriptions,
      proyectos: projects.map((project) => ({ proyectoId: project.proyectoId, nombre: project.nombre, activo: !silenced.has(project.proyectoId) })),
    };
  }

  async setPreference(usuarioId: string, proyectoId: string, activo: unknown, access: ProjectAccess) {
    if (typeof activo !== "boolean") throw CustomError.badRequest("'activo' debe ser true o false");
    if (!canAccessProject(access, proyectoId)) throw CustomError.forbidden("Forbidden");
    await this.push.setMuted(usuarioId, proyectoId, !activo);
    return { proyectoId, activo };
  }

  /** Notifies an installation going offline or coming back; returns how many browsers got it. */
  async installationChanged(change: InstallationChange, now = Date.now()) {
    if (!this.sender.enabled) return 0;
    const kind = `${change.proyectoId}:${change.online ? "online" : "offline"}`;
    const last = this.lastSent.get(kind);
    if (last !== undefined && now - last < this.cooldownMs) return 0;

    const [project] = await this.push.listProjects([change.proyectoId]);
    if (!project) return 0;
    const targets = await this.push.targetsForProject(change.proyectoId);
    if (!targets.length) return 0;
    this.lastSent.set(kind, now);

    const when = localTime(change.at, project.zonaHoraria, now);
    const payload: PushPayload = change.online
      ? { title: `${project.nombre}: instalación en línea`, body: `Volvió a conectarse a las ${when}.`, url: `/projects/${project.proyectoId}/heartbeat`, tag: `installation-${project.proyectoId}` }
      : { title: `${project.nombre}: instalación sin conexión`, body: `Sin conexión desde las ${when}. Los estados de sus módulos ya no son actuales.`, url: `/projects/${project.proyectoId}/heartbeat`, tag: `installation-${project.proyectoId}` };

    const results = await Promise.all(targets.map(async (target) => ({ endpoint: target.endpoint, result: await this.sender.send(target, payload) })));
    await this.push.markDelivered(results.filter((item) => item.result === "ok").map((item) => item.endpoint), now);
    await this.push.removeEndpoints(results.filter((item) => item.result === "gone").map((item) => item.endpoint));
    return results.filter((item) => item.result === "ok").length;
  }
}
