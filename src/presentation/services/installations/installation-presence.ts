import { resolveInstallationPresence } from "@alunzadev/viggo-contracts";

export type ApprovedInstallationPresence = { installationId: string; proyectoId: string; lastSeenAt: number | null };

const KEY_PREFIX = "installation-offline:";

/** Same key as before REFACTO#62, so incidents opened by /health/sync are picked up. */
export const installationOfflineKey = (installationId: string) => `${KEY_PREFIX}${installationId}`;

/**
 * Which "installation offline" incidents to open and which to resolve (REFACTO#62).
 * Offline opens it (when not open yet); back online resolves it. Degraded changes nothing,
 * so an installation hovering around the limit does not open and close incidents over and over.
 * An open incident of this monitor whose installation is no longer approved (unlinked) is
 * resolved too; incidents with other keys are left to whoever opened them.
 */
export const planInstallationIncidents = (
  installations: ApprovedInstallationPresence[],
  openKeys: Iterable<string>,
  now: number,
) => {
  const open = new Set(openKeys);
  const toOpen: Array<ApprovedInstallationPresence & { incidentKey: string }> = [];
  const toResolve: string[] = [];
  /** Resolved because they reached the cloud again (not because they were unlinked). */
  const backOnline: ApprovedInstallationPresence[] = [];
  const known = new Set<string>();

  for (const installation of installations) {
    const incidentKey = installationOfflineKey(installation.installationId);
    known.add(incidentKey);
    const presence = resolveInstallationPresence(installation.lastSeenAt, now);
    if (presence === "offline" && !open.has(incidentKey)) toOpen.push({ ...installation, incidentKey });
    if (presence === "online" && open.has(incidentKey)) {
      toResolve.push(incidentKey);
      backOnline.push(installation);
    }
  }
  for (const incidentKey of open) if (incidentKey.startsWith(KEY_PREFIX) && !known.has(incidentKey)) toResolve.push(incidentKey);

  return { toOpen, toResolve, backOnline };
};
