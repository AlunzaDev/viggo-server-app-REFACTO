import { describe, expect, it } from "vitest";
import { installationOfflineKey, planInstallationIncidents } from "../../src/presentation/services/installations/installation-presence";

// REFACTO#62: which "installation offline" incidents open and which resolve.
const NOW = Date.UTC(2026, 9, 22, 18);
const installation = (id: string, secondsAgo: number | null) => ({
  installationId: id, proyectoId: `p-${id}`, lastSeenAt: secondsAgo === null ? null : NOW - secondsAgo * 1000,
});

describe("planInstallationIncidents", () => {
  it("opens offline installations that have no open incident", () => {
    const plan = planInstallationIncidents([installation("a", 10), installation("b", 300), installation("c", null)], [], NOW);
    expect(plan.toOpen.map((item) => item.incidentKey)).toEqual([installationOfflineKey("b"), installationOfflineKey("c")]);
    expect(plan.toOpen[0]).toMatchObject({ installationId: "b", proyectoId: "p-b" });
    expect(plan.toResolve).toEqual([]);
  });

  it("does not open again what is already open", () => {
    expect(planInstallationIncidents([installation("b", 300)], [installationOfflineKey("b")], NOW).toOpen).toEqual([]);
  });

  it("resolves when the installation is back online", () => {
    const plan = planInstallationIncidents([installation("b", 5)], [installationOfflineKey("b")], NOW);
    expect(plan.toResolve).toEqual([installationOfflineKey("b")]);
    expect(plan.backOnline.map((item) => item.installationId)).toEqual(["b"]);
  });

  it("leaves degraded installations as they are, open or not", () => {
    const plan = planInstallationIncidents([installation("a", 90), installation("b", 90)], [installationOfflineKey("b")], NOW);
    expect(plan).toEqual({ toOpen: [], toResolve: [], backOnline: [] });
  });

  it("resolves incidents of installations that are no longer approved", () => {
    const plan = planInstallationIncidents([], [installationOfflineKey("gone")], NOW);
    expect(plan.toResolve).toEqual([installationOfflineKey("gone")]);
    expect(plan.backOnline).toEqual([]);
  });

  it("leaves alone incidents it did not open", () => {
    expect(planInstallationIncidents([], ["manual-incident"], NOW).toResolve).toEqual([]);
  });
});
