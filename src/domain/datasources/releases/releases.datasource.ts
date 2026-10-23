import type { ReleaseChannel, ReleasePackage } from "@alunzadev/viggo-contracts";

export interface ReleasePackageRecord extends ReleasePackage {
  id: string;
  notas: string;
  createdAt: number;
}

export interface ReleaseChannelRecord extends ReleaseChannel {
  updatedAt: number | null;
}

/** What each installation and its modules last reported (REFACTO#67). */
export interface InstallationVersionRow {
  proyectoId: string;
  proyectoNombre: string;
  installationId: string;
  reportedVersion: string;
  reportedPlatform: string;
  versionReportedAt: number | null;
  modules: Array<{ moduloId: string; nombre: string; identificador: string; reportedVersion: string; reportedPlatform: string }>;
}

export abstract class ReleasesDatasource {
  abstract listPackages(): Promise<ReleasePackageRecord[]>;
  /** Null when that component, version and platform were already published. */
  abstract addPackage(input: ReleasePackage & { notas: string; createdById: string | null }): Promise<ReleasePackageRecord | null>;
  abstract listChannels(): Promise<ReleaseChannelRecord[]>;
  abstract saveChannel(channel: ReleaseChannel, updatedById: string | null): Promise<ReleaseChannelRecord>;
  /** Which of these parking ids exist. */
  abstract existingProjects(ids: string[]): Promise<string[]>;
  abstract installationVersions(): Promise<InstallationVersionRow[]>;
  abstract installationPlatform(installationId: string): Promise<string>;
}
