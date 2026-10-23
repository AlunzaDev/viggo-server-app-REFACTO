import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresDatabase } from "../../src/data/postgres";
import { buildInstallationPresenceMonitor } from "../../src/presentation/dependencies/system.dependencies";
import { installationOfflineKey } from "../../src/presentation/services/installations/installation-presence";

// REFACTO#62: the "installation offline" incident opens and resolves on its own.
const db = () => PostgresDatabase.client;
const tag = `presence-${randomUUID().slice(0, 8)}`;
const ids = { online: `${tag}-online`, offline: `${tag}-offline`, never: `${tag}-never` };
let proyectoId = "";
const monitor = () => buildInstallationPresenceMonitor();
const incident = (installationId: string) => db().operationalIncident.findUnique({ where: { incidentKey: installationOfflineKey(installationId) } });
const poll = (installationId: string, at: number | null) =>
  db().localInstallation.update({ where: { installationId }, data: { lastCommandPollAt: at === null ? null : new Date(at) } });

describe("InstallationPresenceMonitor", () => {
  beforeAll(async () => {
    await PostgresDatabase.connect({ databaseUrl: process.env.DATABASE_URL!, poolMax: 4 });
    proyectoId = (await db().proyecto.create({ data: { nombre: tag, ciudad: "CDMX", identificador: tag, coordinates: [0, 0] } })).id;
    const now = Date.now();
    for (const [installationId, at] of [[ids.online, now - 10_000], [ids.offline, now - 600_000], [ids.never, null]] as const) {
      await db().localInstallation.create({ data: { installationId, proyectoId, status: "approved", lastCommandPollAt: at === null ? null : new Date(at) } });
    }
  });

  afterAll(async () => {
    await db().operationalIncident.deleteMany({ where: { installationId: { startsWith: tag } } });
    await db().jobLease.deleteMany({ where: { name: "installation-presence" } });
    await db().localInstallation.deleteMany({ where: { proyectoId } });
    await db().proyecto.deleteMany({ where: { id: proyectoId } });
    await PostgresDatabase.disconnect();
  });

  it("opens the incident for offline and never-seen installations, once", async () => {
    const now = Date.now();
    await monitor().runOnce(now);
    expect(await incident(ids.online)).toBeNull();
    expect(await incident(ids.offline)).toMatchObject({ status: "open", type: "INSTALLATION_OFFLINE", severity: "critical", proyectoId, installationId: ids.offline });
    expect(await incident(ids.never)).toMatchObject({ status: "open" });

    // The next pass does not touch what is already open.
    const before = await incident(ids.offline);
    await monitor().runOnce(now + 30_000);
    expect((await incident(ids.offline))?.lastSeenAt).toEqual(before?.lastSeenAt);
  });

  it("resolves it when the installation is back, and reopens it as a new occurrence", async () => {
    const now = Date.now();
    await poll(ids.offline, now);
    await monitor().runOnce(now);
    expect(await incident(ids.offline)).toMatchObject({ status: "resolved" });

    const later = now + 600_000;
    await monitor().runOnce(later);
    const reopened = await incident(ids.offline);
    expect(reopened).toMatchObject({ status: "open", resolvedAt: null });
    expect(reopened?.openedAt.getTime()).toBe(later);
  });

  it("resolves it when the installation is unlinked", async () => {
    await db().localInstallation.update({ where: { installationId: ids.never }, data: { status: "rejected" } });
    await monitor().runOnce(Date.now());
    expect(await incident(ids.never)).toMatchObject({ status: "resolved" });
  });
});
