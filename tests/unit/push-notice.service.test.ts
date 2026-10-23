import { describe, expect, it } from "vitest";
import type { PushProject, PushSubscriptionInput, PushTarget } from "../../src/domain/datasources/push/push.datasource";
import { PushRepository, PushSender, type PushPayload } from "../../src/domain/repositories/push/push.repository";
import { PushNoticeService } from "../../src/presentation/services/push/push-notice.service";

// REFACTO#65: who gets the notice, how often, and what happens with dead subscriptions.
class FakeRepository extends PushRepository {
  saved: PushSubscriptionInput[] = [];
  muted = new Set<string>();
  delivered: string[] = [];
  removed: string[] = [];
  targets: PushTarget[] = [{ endpoint: "https://push.example/a", p256dh: "k", auth: "a" }, { endpoint: "https://push.example/gone", p256dh: "k", auth: "a" }];
  projects: PushProject[] = [{ proyectoId: "p1", nombre: "Plaza", zonaHoraria: "America/Mexico_City" }];
  async saveSubscription(input: PushSubscriptionInput) { this.saved.push(input); }
  async deleteSubscription() { return true; }
  async countSubscriptions() { return this.saved.length; }
  async listProjects(ids: string[] | null) { return ids ? this.projects.filter((project) => ids.includes(project.proyectoId)) : this.projects; }
  async mutedProjects() { return [...this.muted]; }
  async setMuted(_usuarioId: string, proyectoId: string, muted: boolean) { if (muted) this.muted.add(proyectoId); else this.muted.delete(proyectoId); }
  async targetsForProject() { return this.targets; }
  async markDelivered(endpoints: string[]) { this.delivered.push(...endpoints); }
  async removeEndpoints(endpoints: string[]) { this.removed.push(...endpoints); }
}

class FakeSender extends PushSender {
  sent: Array<{ endpoint: string; payload: PushPayload }> = [];
  constructor(readonly enabled = true, readonly publicKey = "public-key") { super(); }
  async send(target: PushTarget, payload: PushPayload) {
    this.sent.push({ endpoint: target.endpoint, payload });
    return target.endpoint.endsWith("gone") ? "gone" as const : "ok" as const;
  }
}

const NOW = Date.UTC(2026, 9, 23, 20, 5);
const setup = (enabled = true) => {
  const repo = new FakeRepository();
  const sender = new FakeSender(enabled);
  return { repo, sender, service: new PushNoticeService(repo, sender, 5 * 60_000) };
};

describe("PushNoticeService", () => {
  it("notifies an installation going offline, in the parking's local time, and drops dead subscriptions", async () => {
    const { repo, sender, service } = setup();
    expect(await service.installationChanged({ proyectoId: "p1", online: false, at: NOW - 2 * 60_000 }, NOW)).toBe(1);
    expect(sender.sent[0]?.payload).toMatchObject({
      title: "Plaza: instalación sin conexión",
      body: "Sin conexión desde las 14:03. Los estados de sus módulos ya no son actuales.",
      url: "/projects/p1/heartbeat",
      tag: "installation-p1",
    });
    expect(repo.delivered).toEqual(["https://push.example/a"]);
    expect(repo.removed).toEqual(["https://push.example/gone"]);
  });

  it("does not repeat the same notice within the cooldown, but tells when it comes back", async () => {
    const { sender, service } = setup();
    await service.installationChanged({ proyectoId: "p1", online: false, at: NOW }, NOW);
    expect(await service.installationChanged({ proyectoId: "p1", online: false, at: NOW }, NOW + 60_000)).toBe(0);
    expect(await service.installationChanged({ proyectoId: "p1", online: true, at: NOW + 60_000 }, NOW + 60_000)).toBe(1);
    expect(sender.sent.at(-1)?.payload.title).toBe("Plaza: instalación en línea");
    expect(await service.installationChanged({ proyectoId: "p1", online: false, at: NOW }, NOW + 6 * 60_000)).toBe(1);
  });

  it("sends nothing when it is not configured, for unknown parkings or without recipients", async () => {
    expect(await setup(false).service.installationChanged({ proyectoId: "p1", online: false, at: NOW }, NOW)).toBe(0);
    const { repo, service } = setup();
    expect(await service.installationChanged({ proyectoId: "otro", online: false, at: NOW }, NOW)).toBe(0);
    repo.targets = [];
    expect(await service.installationChanged({ proyectoId: "p1", online: false, at: NOW }, NOW)).toBe(0);
  });

  it("stores only valid https subscriptions", async () => {
    const { repo, service } = setup();
    const keys = { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" };
    await service.subscribe("u1", { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys }, "Chrome");
    expect(repo.saved).toHaveLength(1);
    for (const body of [{ endpoint: "http://insecure.example/x", keys }, { endpoint: "no-url", keys }, { endpoint: "https://ok.example/x", keys: { p256dh: "<script>", auth: "a" } }, {}]) {
      await expect(service.subscribe("u1", body, "")).rejects.toMatchObject({ statusCode: 400 });
    }
    await expect(setup(false).service.subscribe("u1", { endpoint: "https://ok.example/x", keys }, "")).rejects.toMatchObject({ statusCode: 503 });
  });

  it("lists the user's parkings as active unless muted, and only lets them change their own parkings", async () => {
    const { repo, service } = setup();
    repo.muted.add("p1");
    expect((await service.preferences("u1", { all: true, allowed: [] })).proyectos).toEqual([{ proyectoId: "p1", nombre: "Plaza", activo: false }]);
    await service.setPreference("u1", "p1", true, { all: false, allowed: ["p1"] });
    expect(repo.muted.has("p1")).toBe(false);
    await expect(service.setPreference("u1", "p2", true, { all: false, allowed: ["p1"] })).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.setPreference("u1", "p1", "si", { all: true, allowed: [] })).rejects.toMatchObject({ statusCode: 400 });
  });
});
