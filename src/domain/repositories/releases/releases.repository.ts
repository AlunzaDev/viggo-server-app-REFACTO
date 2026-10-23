import type { ReleaseChannel, ReleasePackage } from "@alunzadev/viggo-contracts";
import type {
  InstallationVersionRow,
  ReleaseChannelRecord,
  ReleasePackageRecord,
} from "../../datasources/releases/releases.datasource";

export abstract class ReleasesRepository {
  abstract listPackages(): Promise<ReleasePackageRecord[]>;
  abstract addPackage(input: ReleasePackage & { notas: string; createdById: string | null }): Promise<ReleasePackageRecord | null>;
  abstract listChannels(): Promise<ReleaseChannelRecord[]>;
  abstract saveChannel(channel: ReleaseChannel, updatedById: string | null): Promise<ReleaseChannelRecord>;
  abstract existingProjects(ids: string[]): Promise<string[]>;
  abstract installationVersions(): Promise<InstallationVersionRow[]>;
  abstract installationPlatform(installationId: string): Promise<string>;
}
