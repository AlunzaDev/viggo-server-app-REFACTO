import type { ReleaseChannel, ReleasePackage } from "@alunzadev/viggo-contracts";
import type { ReleasesDatasource } from "../../../domain/datasources/releases/releases.datasource";
import { ReleasesRepository } from "../../../domain/repositories/releases/releases.repository";

export class ReleasesRepositoryImpl implements ReleasesRepository {
  constructor(private readonly datasource: ReleasesDatasource) {}

  listPackages() {
    return this.datasource.listPackages();
  }

  addPackage(input: ReleasePackage & { notas: string; createdById: string | null }) {
    return this.datasource.addPackage(input);
  }

  listChannels() {
    return this.datasource.listChannels();
  }

  saveChannel(channel: ReleaseChannel, updatedById: string | null) {
    return this.datasource.saveChannel(channel, updatedById);
  }

  existingProjects(ids: string[]) {
    return this.datasource.existingProjects(ids);
  }

  installationVersions() {
    return this.datasource.installationVersions();
  }

  installationPlatform(installationId: string) {
    return this.datasource.installationPlatform(installationId);
  }
}
