import {
  RELEASE_COMPONENTS,
  RELEASE_PLATFORMS,
  compareVersions,
  isReleasePackage,
  isReleasePlatform,
  isVersion,
  needsUpdate,
  parseReleaseComponent,
  previousVersion,
  resolveDesiredRelease,
  type ReleaseChannel,
  type ReleaseComponent,
} from "@alunzadev/viggo-contracts";
import { CustomError } from "../../../domain/errors/custom.error";
import type { ReleaseChannelRecord } from "../../../domain/datasources/releases/releases.datasource";
import type { ReleasesRepository } from "../../../domain/repositories/releases/releases.repository";

const MAX_NOTES = 500;
const MAX_PILOT_PROJECTS = 500;

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const emptyChannel = (component: ReleaseComponent): ReleaseChannel => ({ component, generalVersion: null, pilotVersion: null, pilotProjects: [] });

/**
 * The catalog of builds and which version each parking should run (REFACTO#67), as
 * SIKKOUNTER's runner releases: publish a version, try it on pilot parkings, roll back by
 * pointing the channel to an older one. Applying it on each device is LOCAL-OPERATIVA#25.
 */
export class ReleasesService {
  constructor(private readonly releases: ReleasesRepository) {}

  async catalog() {
    const [packages, channels] = await Promise.all([this.releases.listPackages(), this.releases.listChannels()]);
    return {
      componentes: RELEASE_COMPONENTS.map((component) => {
        const channel = channels.find((item) => item.component === component) ?? { ...emptyChannel(component), updatedAt: null };
        const own = packages.filter((item) => item.component === component).sort((a, b) => compareVersions(b.version, a.version));
        return {
          component,
          canal: channel,
          // Where a rollback of the general version would point.
          versionAnterior: channel.generalVersion ? previousVersion(own, component, channel.generalVersion) : null,
          paquetes: own,
        };
      }),
    };
  }

  async addPackage(body: Record<string, unknown>, userId: string | null) {
    const candidate = {
      component: parseReleaseComponent(body.component),
      version: text(body.version),
      platform: text(body.platform),
      image: text(body.image).toLowerCase(),
      digest: text(body.digest).toLowerCase(),
    };
    if (!isReleasePackage(candidate)) {
      throw CustomError.badRequest("Paquete inválido: componente, versión MAJOR.MINOR.PATCH, plataforma, imagen sin etiqueta y digest sha256 son obligatorios");
    }
    const notas = text(body.notas);
    if (notas.length > MAX_NOTES) throw CustomError.badRequest(`Las notas no pueden pasar de ${MAX_NOTES} caracteres`);
    const created = await this.releases.addPackage({ ...candidate, notas, createdById: userId });
    if (!created) throw CustomError.conflict("Esa versión ya está registrada para esa plataforma");
    return created;
  }

  /**
   * Changes a channel: only the fields sent change. A version has to be in the catalog for
   * the component; pilot parkings have to exist. Sending an older general version is a rollback.
   */
  async setChannel(componentRaw: string, body: Record<string, unknown>, userId: string | null) {
    const component = parseReleaseComponent(componentRaw);
    if (!component) throw CustomError.notFound("Componente desconocido");
    const [packages, channels] = await Promise.all([this.releases.listPackages(), this.releases.listChannels()]);
    const current: ReleaseChannel = channels.find((item) => item.component === component) ?? emptyChannel(component);
    const published = new Set(packages.filter((item) => item.component === component).map((item) => item.version));

    const version = (key: "generalVersion" | "pilotVersion") => {
      if (!(key in body)) return current[key];
      const value = body[key];
      if (value === null || value === "") return null;
      if (!isVersion(value) || !published.has(text(value))) throw CustomError.badRequest(`'${key}' debe ser una versión registrada de ${component}`);
      return text(value);
    };
    let pilotProjects = [...current.pilotProjects];
    if ("pilotProjects" in body) {
      if (!Array.isArray(body.pilotProjects) || body.pilotProjects.length > MAX_PILOT_PROJECTS) throw CustomError.badRequest("'pilotProjects' debe ser una lista de proyectos");
      const ids = [...new Set(body.pilotProjects.map(text).filter(Boolean))];
      const existing = new Set(await this.releases.existingProjects(ids));
      const missing = ids.filter((id) => !existing.has(id));
      if (missing.length) throw CustomError.badRequest(`Proyectos inexistentes: ${missing.join(", ")}`);
      pilotProjects = ids;
    }
    return this.releases.saveChannel({ component, generalVersion: version("generalVersion"), pilotVersion: version("pilotVersion"), pilotProjects }, userId);
  }

  /** What each installation and module runs against what it should run. */
  async status() {
    const [packages, channels, rows] = await Promise.all([this.releases.listPackages(), this.releases.listChannels(), this.releases.installationVersions()]);
    const channelOf = (component: ReleaseComponent) => channels.find((item) => item.component === component) ?? null;
    const compare = (component: ReleaseComponent, proyectoId: string, version: string, platform: string) => {
      const desired = resolveDesiredRelease(packages, channelOf(component), { proyectoId, platform });
      return {
        version: version || null,
        plataforma: platform || null,
        deseada: desired ? { version: desired.version, canal: desired.channel } : null,
        // Without a report there is nothing to compare: it is shown as unknown, not as outdated.
        actualizar: Boolean(version) && needsUpdate(version, desired),
      };
    };
    return {
      instalaciones: rows.map((row) => ({
        proyectoId: row.proyectoId,
        proyectoNombre: row.proyectoNombre,
        installationId: row.installationId,
        reportadoEn: row.versionReportedAt,
        operativo: compare("operativo", row.proyectoId, row.reportedVersion, row.reportedPlatform),
        expendedoras: row.modules.map((modulo) => ({
          moduloId: modulo.moduloId,
          nombre: modulo.nombre,
          identificador: modulo.identificador,
          ...compare("expendedora", row.proyectoId, modulo.reportedVersion, modulo.reportedPlatform),
        })),
      })),
    };
  }

  /**
   * What an installation should run (GET /api/sync/releases): OPERATIVO for its own platform,
   * and the vending machines for each platform, since its modules may run on different ones.
   */
  async desiredForInstallation(installationId: string, proyectoId: string, platformQuery: unknown) {
    const [packages, channels] = await Promise.all([this.releases.listPackages(), this.releases.listChannels()]);
    const platform = isReleasePlatform(platformQuery) ? platformQuery : await this.releases.installationPlatform(installationId);
    const channelOf = (component: ReleaseComponent): ReleaseChannelRecord | null => channels.find((item) => item.component === component) ?? null;
    const pick = (desired: ReturnType<typeof resolveDesiredRelease>) =>
      desired ? { version: desired.version, image: desired.image, digest: desired.digest, platform: desired.platform, channel: desired.channel } : null;
    return {
      operativo: pick(resolveDesiredRelease(packages, channelOf("operativo"), { proyectoId, platform })),
      expendedora: Object.fromEntries(RELEASE_PLATFORMS.map((item) =>
        [item, pick(resolveDesiredRelease(packages, channelOf("expendedora"), { proyectoId, platform: item }))])),
    };
  }
}

