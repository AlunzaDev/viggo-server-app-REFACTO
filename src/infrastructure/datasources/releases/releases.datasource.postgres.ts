import { isReleaseComponent, isReleasePlatform, type ReleaseChannel, type ReleasePackage } from "@alunzadev/viggo-contracts";
import { PostgresDatabase } from "../../../data/postgres";
import { Prisma, type ReleasePackage as ReleasePackageRow } from "../../../generated/prisma/client";
import {
  ReleasesDatasource,
  type InstallationVersionRow,
  type ReleaseChannelRecord,
  type ReleasePackageRecord,
} from "../../../domain/datasources/releases/releases.datasource";
import { isUuid } from "../postgres/prisma-errors";

const toPackage = (row: ReleasePackageRow): ReleasePackageRecord | null =>
  isReleaseComponent(row.component) && isReleasePlatform(row.platform)
    ? { id: row.id, component: row.component, version: row.version, platform: row.platform, image: row.image, digest: row.digest, notas: row.notas, createdAt: row.createdAt.getTime() }
    : null;

export class ReleasesPostgresDatasource extends ReleasesDatasource {
  private get db() {
    return PostgresDatabase.client;
  }

  async listPackages() {
    const rows = await this.db.releasePackage.findMany({ orderBy: [{ component: "asc" }, { createdAt: "desc" }] });
    return rows.map(toPackage).filter((item): item is ReleasePackageRecord => item !== null);
  }

  async addPackage(input: ReleasePackage & { notas: string; createdById: string | null }) {
    try {
      const row = await this.db.releasePackage.create({ data: {
        component: input.component, version: input.version, platform: input.platform, image: input.image, digest: input.digest,
        notas: input.notas, createdById: input.createdById && isUuid(input.createdById) ? input.createdById : null,
      } });
      return toPackage(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return null;
      throw error;
    }
  }

  async listChannels(): Promise<ReleaseChannelRecord[]> {
    const rows = await this.db.releaseChannel.findMany();
    return rows.filter((row) => isReleaseComponent(row.component)).map((row) => ({
      component: row.component as ReleaseChannel["component"],
      generalVersion: row.generalVersion,
      pilotVersion: row.pilotVersion,
      pilotProjects: row.pilotProjects,
      updatedAt: row.updatedAt.getTime(),
    }));
  }

  async saveChannel(channel: ReleaseChannel, updatedById: string | null): Promise<ReleaseChannelRecord> {
    const data = {
      generalVersion: channel.generalVersion,
      pilotVersion: channel.pilotVersion,
      pilotProjects: [...channel.pilotProjects],
      updatedById: updatedById && isUuid(updatedById) ? updatedById : null,
    };
    const row = await this.db.releaseChannel.upsert({ where: { component: channel.component }, create: { component: channel.component, ...data }, update: data });
    return { ...channel, pilotProjects: row.pilotProjects, updatedAt: row.updatedAt.getTime() };
  }

  async existingProjects(ids: string[]) {
    const valid = ids.filter(isUuid);
    if (!valid.length) return [];
    return (await this.db.proyecto.findMany({ where: { id: { in: valid } }, select: { id: true } })).map((row) => row.id);
  }

  async installationVersions(): Promise<InstallationVersionRow[]> {
    const installations = await this.db.localInstallation.findMany({
      where: { status: "approved" },
      select: {
        installationId: true, proyectoId: true, reportedVersion: true, reportedPlatform: true, versionReportedAt: true,
        proyecto: { select: { nombre: true, modulos: {
          where: { estado: true },
          select: { id: true, nombre: true, identificador: true, deviceState: { select: { reportedVersion: true, reportedPlatform: true } } },
          orderBy: { nombre: "asc" },
        } } },
      },
      orderBy: { proyecto: { nombre: "asc" } },
    });
    return installations.map((row) => ({
      proyectoId: row.proyectoId,
      proyectoNombre: row.proyecto.nombre,
      installationId: row.installationId,
      reportedVersion: row.reportedVersion,
      reportedPlatform: row.reportedPlatform,
      versionReportedAt: row.versionReportedAt?.getTime() ?? null,
      modules: row.proyecto.modulos.map((modulo) => ({
        moduloId: modulo.id,
        nombre: modulo.nombre,
        identificador: modulo.identificador,
        reportedVersion: modulo.deviceState?.reportedVersion ?? "",
        reportedPlatform: modulo.deviceState?.reportedPlatform ?? "",
      })),
    }));
  }

  async installationPlatform(installationId: string) {
    const row = await this.db.localInstallation.findUnique({ where: { installationId }, select: { reportedPlatform: true } });
    return row?.reportedPlatform ?? "";
  }
}
