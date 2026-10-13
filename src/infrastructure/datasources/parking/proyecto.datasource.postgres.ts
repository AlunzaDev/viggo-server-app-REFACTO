import { createHash, randomBytes } from "node:crypto";
import { PostgresDatabase } from "../../../data/postgres";
import type { Prisma } from "../../../generated/prisma/client";
import {
  ProyectoDatasource,
  type CreateProyectoResult,
  type ProyectoInstallationLinkTokenResult,
} from "../../../domain/datasources/parking/proyecto.datasource";
import { ProyectoEntity } from "../../../domain/entities/parking/proyecto.entity";
import { CustomError } from "../../../domain/errors/custom.error";
import { deleteManagedProjectImage } from "../../../presentation/utils/project-image.util";
import {
  decryptInstallationLinkToken,
  encryptInstallationLinkToken,
} from "../../../presentation/utils/installation-link-token-crypto.util";
import { isUuid, translatePrismaError, withPrismaErrors } from "../postgres/prisma-errors";

const proyectoInclude = { remoteSupport: true } satisfies Prisma.ProyectoInclude;
type ProyectoRow = Prisma.ProyectoGetPayload<{ include: typeof proyectoInclude }>;

type ProyectoInput = Partial<Omit<ProyectoEntity, "id">> & {
  remoteSupport?: (ProyectoEntity["remoteSupport"] & { updatedAt?: Date }) | null;
};

const createInstallationLinkToken = (codigoProyecto?: string) => {
  const prefix = codigoProyecto ? `viggo-${codigoProyecto}` : "viggo-project";
  return `${prefix}-${randomBytes(18).toString("base64url")}`;
};

const hashInstallationLinkToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

const toProyectoEntity = (row: ProyectoRow) =>
  ProyectoEntity.fromObject({
    id: row.id,
    nombre: row.nombre,
    coordinates: row.coordinates,
    ciudad: row.ciudad,
    direccion: row.direccion,
    identificador: row.identificador,
    codigoProyecto: row.codigoProyecto,
    serverIp: row.serverIp,
    serverMac: row.serverMac,
    localApiBaseUrl: row.localApiBaseUrl,
    remoteSupport: row.remoteSupport,
    img: row.img,
    descripcion: row.descripcion,
    estado: row.estado,
  });

const toProyectoScalars = (proyecto: ProyectoInput) => ({
  nombre: proyecto.nombre,
  coordinates: proyecto.coordinates as Prisma.InputJsonValue | undefined,
  ciudad: proyecto.ciudad,
  direccion: proyecto.direccion,
  identificador: proyecto.identificador,
  serverIp: proyecto.serverIp,
  serverMac: proyecto.serverMac?.trim().toUpperCase(),
  localApiBaseUrl: proyecto.localApiBaseUrl,
  img: proyecto.img,
  descripcion: proyecto.descripcion,
  estado: proyecto.estado,
});

const toRemoteSupportData = (remoteSupport: NonNullable<ProyectoInput["remoteSupport"]>) => ({
  provider: remoteSupport.provider,
  enabled: remoteSupport.enabled,
  baseUrl: remoteSupport.baseUrl ?? "",
  groupId: remoteSupport.groupId ?? "",
  updatedAt: remoteSupport.updatedAt ?? new Date(),
});

/** The project code comes from a sequence capped at 9999. */
const translateCodeExhausted = (error: unknown) =>
  error instanceof Error && /reached maximum value of sequence/i.test(error.message)
    ? CustomError.badRequest("Se alcanzo el limite de 9999 codigos de proyecto")
    : error;

const proyectoInUse = CustomError.conflict(
  "No se puede eliminar el proyecto porque tiene módulos, pensiones, pagos u otros registros asociados",
);

export class ProyectoPostgresDatasource extends ProyectoDatasource {
  private get proyectos() {
    return PostgresDatabase.client.proyecto;
  }

  async create(proyecto: Omit<ProyectoEntity, "id">): Promise<CreateProyectoResult> {
    const input = proyecto as ProyectoInput;
    try {
      return await PostgresDatabase.client.$transaction(async (tx) => {
        const created = await tx.proyecto.create({
          data: {
            ...toProyectoScalars(input),
            nombre: proyecto.nombre,
            coordinates: proyecto.coordinates as Prisma.InputJsonValue,
            ciudad: proyecto.ciudad,
            identificador: proyecto.identificador,
            // Explicit codes are kept (imports); otherwise the sequence assigns one.
            ...(proyecto.codigoProyecto ? { codigoProyecto: proyecto.codigoProyecto } : {}),
            ...(input.remoteSupport ? { remoteSupport: { create: toRemoteSupportData(input.remoteSupport) } } : {}),
          },
        });

        // The token embeds the code, which is only known after the insert.
        const installationLinkToken = createInstallationLinkToken(created.codigoProyecto);
        const row = await tx.proyecto.update({
          where: { id: created.id },
          data: {
            installationLinkTokenHash: hashInstallationLinkToken(installationLinkToken),
            installationLinkTokenEncrypted: encryptInstallationLinkToken(installationLinkToken),
            installationLinkTokenIssuedAt: new Date(),
          },
          include: proyectoInclude,
        });
        return { proyecto: toProyectoEntity(row), installationLinkToken };
      });
    } catch (error) {
      deleteManagedProjectImage(proyecto.img);
      throw translateCodeExhausted(translatePrismaError(error));
    }
  }

  async getInstallationLinkToken(id: string): Promise<ProyectoInstallationLinkTokenResult | null> {
    if (!isUuid(id)) return null;
    const row = await this.proyectos.findUnique({ where: { id }, include: proyectoInclude });
    if (!row) return null;

    return {
      proyecto: toProyectoEntity(row),
      installationLinkToken: decryptInstallationLinkToken(row.installationLinkTokenEncrypted.trim()) || "",
    };
  }

  async regenerateInstallationLinkToken(id: string): Promise<ProyectoInstallationLinkTokenResult | null> {
    if (!isUuid(id)) return null;
    const existing = await this.proyectos.findUnique({ where: { id }, select: { codigoProyecto: true } });
    if (!existing) return null;

    const installationLinkToken = createInstallationLinkToken(existing.codigoProyecto);
    const row = await this.proyectos.update({
      where: { id },
      data: {
        installationLinkTokenHash: hashInstallationLinkToken(installationLinkToken),
        installationLinkTokenEncrypted: encryptInstallationLinkToken(installationLinkToken),
        installationLinkTokenIssuedAt: new Date(),
      },
      include: proyectoInclude,
    });
    return { proyecto: toProyectoEntity(row), installationLinkToken };
  }

  async findById(id: string): Promise<ProyectoEntity | null> {
    if (!isUuid(id)) return null;
    const row = await this.proyectos.findUnique({ where: { id }, include: proyectoInclude });
    return row ? toProyectoEntity(row) : null;
  }

  async findByIdentificador(identificador: string): Promise<ProyectoEntity | null> {
    const row = await this.proyectos.findUnique({ where: { identificador }, include: proyectoInclude });
    return row ? toProyectoEntity(row) : null;
  }

  async getAll(): Promise<ProyectoEntity[]> {
    const rows = await this.proyectos.findMany({
      include: proyectoInclude,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map(toProyectoEntity);
  }

  async update(id: string, proyecto: Partial<Omit<ProyectoEntity, "id">>): Promise<ProyectoEntity | null> {
    const input = proyecto as ProyectoInput;
    const existing = isUuid(id)
      ? await this.proyectos.findUnique({ where: { id }, select: { img: true } })
      : null;
    if (!existing) {
      deleteManagedProjectImage(proyecto.img);
      return null;
    }

    const previousImage = existing.img.trim();
    const nextImage = typeof proyecto.img === "string" ? proyecto.img.trim() : undefined;

    try {
      const row = await withPrismaErrors(() =>
        PostgresDatabase.client.$transaction(async (tx) => {
          if (input.remoteSupport === null) {
            await tx.proyectoRemoteSupport.deleteMany({ where: { proyectoId: id } });
          } else if (input.remoteSupport) {
            const data = toRemoteSupportData(input.remoteSupport);
            await tx.proyectoRemoteSupport.upsert({
              where: { proyectoId: id },
              create: { proyectoId: id, ...data },
              update: data,
            });
          }
          return tx.proyecto.update({ where: { id }, data: toProyectoScalars(input), include: proyectoInclude });
        }),
      );

      if (nextImage !== undefined && nextImage !== previousImage) {
        deleteManagedProjectImage(previousImage);
      }
      return toProyectoEntity(row);
    } catch (error) {
      if (nextImage && nextImage !== previousImage) {
        deleteManagedProjectImage(nextImage);
      }
      throw error;
    }
  }

  async delete(id: string): Promise<ProyectoEntity | null> {
    if (!isUuid(id)) return null;
    const row = await this.proyectos.findUnique({ where: { id }, include: proyectoInclude });
    if (!row) return null;

    await withPrismaErrors(() => this.proyectos.delete({ where: { id } }), { foreignKey: proyectoInUse });
    deleteManagedProjectImage(row.img);
    return toProyectoEntity(row);
  }
}
