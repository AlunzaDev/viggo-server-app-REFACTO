// Builds the documents ADMINISTRATIVO sends to OPERATIVO from Postgres rows, keeping the
// field names OPERATIVO stores locally (it reads `_id` or `id` and keeps the rest as is).
import type { Prisma } from "../../../generated/prisma/client";

export const proyectoDocumentInclude = { remoteSupport: true } satisfies Prisma.ProyectoInclude;
type ProyectoRow = Prisma.ProyectoGetPayload<{ include: typeof proyectoDocumentInclude }>;

/** Project as OPERATIVO stores it. Link token hash/ciphertext are never sent. */
export const toProyectoDocument = (row: ProyectoRow) => ({
  _id: row.id,
  nombre: row.nombre,
  coordinates: row.coordinates,
  ciudad: row.ciudad,
  direccion: row.direccion,
  identificador: row.identificador,
  codigoProyecto: row.codigoProyecto,
  serverIp: row.serverIp,
  serverMac: row.serverMac,
  localApiBaseUrl: row.localApiBaseUrl,
  remoteSupport: row.remoteSupport
    ? {
        provider: row.remoteSupport.provider,
        enabled: row.remoteSupport.enabled,
        baseUrl: row.remoteSupport.baseUrl,
        groupId: row.remoteSupport.groupId,
        updatedAt: row.remoteSupport.updatedAt,
      }
    : undefined,
  img: row.img,
  descripcion: row.descripcion,
  estado: row.estado,
});

export const moduloDocumentInclude = {
  submodulos: { orderBy: { position: "asc" } },
  remoteSupport: true,
} satisfies Prisma.ModuloInclude;
type ModuloRow = Prisma.ModuloGetPayload<{ include: typeof moduloDocumentInclude }>;

const coordinates = (longitude: number | null, latitude: number | null) =>
  longitude !== null && latitude !== null ? [longitude, latitude] : [];

/** Module configuration only; device binding/runtime belongs to OPERATIVO. */
export const toModuloDocument = (row: ModuloRow) => ({
  _id: row.id,
  nombre: row.nombre,
  proyecto: row.proyectoId,
  tipo: row.tipo,
  estado: row.estado,
  identificador: row.identificador,
  ip: row.ip,
  mac: row.mac,
  ubicacion: row.ubicacion,
  coordinates: coordinates(row.longitude, row.latitude),
  descripcion: row.descripcion,
  remoteSupport: row.remoteSupport
    ? {
        provider: row.remoteSupport.provider,
        enabled: row.remoteSupport.enabled,
        deviceName: row.remoteSupport.deviceName,
        deviceId: row.remoteSupport.deviceId,
        groupId: row.remoteSupport.groupId,
        baseUrl: row.remoteSupport.baseUrl,
        supportUrl: row.remoteSupport.supportUrl,
        desktopUrl: row.remoteSupport.desktopUrl,
        terminalUrl: row.remoteSupport.terminalUrl,
        linkedAt: row.remoteSupport.linkedAt ?? undefined,
        updatedAt: row.remoteSupport.updatedAt ?? undefined,
      }
    : undefined,
  submodulos: row.submodulos.map((submodulo) => ({
    submoduloId: submodulo.submoduloId,
    nombre: submodulo.nombre,
    tipo: submodulo.tipo,
    identificador: submodulo.identificador,
    ip: submodulo.ip,
    mac: submodulo.mac,
    ubicacion: submodulo.ubicacion,
    coordinates: coordinates(submodulo.longitude, submodulo.latitude),
    descripcion: submodulo.descripcion,
    estado: submodulo.estado,
  })),
});

export const pensionDocumentInclude = { horarios: { orderBy: { weekDay: "asc" } } } satisfies Prisma.PensionInclude;
type PensionRow = Prisma.PensionGetPayload<{ include: typeof pensionDocumentInclude }>;

export const toPensionDocument = (row: PensionRow) => ({
  _id: row.id,
  proyecto: row.proyectoId,
  nombre: row.nombre,
  validez: row.horarios.map((horario) => ({
    weekDay: horario.weekDay,
    from: [Math.floor(horario.fromMinutes / 60), horario.fromMinutes % 60],
    to: [Math.floor(horario.toMinutes / 60), horario.toMinutes % 60],
  })),
  precio: row.precio.toNumber(),
  descripcion: row.descripcion,
  estado: row.estado,
  ...(row.cancelledAt ? { cancelledAt: row.cancelledAt.getTime() } : {}),
  ...(row.cancelledById ? { cancelledBy: row.cancelledById } : {}),
  cancellationReason: row.cancellationReason,
});

type PensionPassRow = Prisma.PensionPassGetPayload<object>;

export const toPensionPassDocument = (row: PensionPassRow) => ({
  _id: row.id,
  usuario: row.usuarioId ?? undefined,
  name: row.name,
  pension: row.pensionId,
  idPass: row.idPass,
  vigent: row.vigent,
  created: row.created.getTime(),
  from: row.validFrom ? row.validFrom.getTime() : -1,
  to: row.validTo ? row.validTo.getTime() : -1,
  estado: row.estado,
  antiPassback: row.antiPassback,
});

export const usuarioDocumentInclude = {
  parkings: { select: { proyectoId: true } },
  appPermissions: { select: { app: true, permissionProfileId: true } },
} satisfies Prisma.UsuarioInclude;
type UsuarioRow = Prisma.UsuarioGetPayload<{ include: typeof usuarioDocumentInclude }>;

/** User for offline login in OPERATIVO (includes the bcrypt hash; never reset/validation tokens). */
export const toUsuarioDocument = (row: UsuarioRow) => ({
  _id: row.id,
  nombre: row.nombre,
  apellido: row.apellido,
  correo: row.correo,
  telefono: row.telefono,
  coordinates: row.coordinates ?? [],
  password: row.password,
  emailValidated: row.emailValidated,
  rol: row.rol,
  parkings: row.parkings.map((parking) => parking.proyectoId),
  allowedApps: row.allowedApps,
  appPermissions: row.appPermissions,
  ...(row.nacimiento ? { nacimiento: row.nacimiento.getTime() } : {}),
  img: row.img,
  estado: row.estado,
  google: row.google,
});

type PermissionProfileRow = Prisma.PermissionProfileGetPayload<object>;

export const toPermissionProfileDocument = (row: PermissionProfileRow) => ({
  _id: row.id,
  app: row.app,
  nombre: row.nombre,
  descripcion: row.descripcion,
  modules: row.modules,
  estado: row.estado,
});

type HeartbeatRow = Prisma.ProjectHeartbeatSnapshotGetPayload<object>;

/** Stored heartbeat in the shape the dashboard already reads (epoch ms). */
export const toHeartbeatDocument = (row: HeartbeatRow) => ({
  proyectoId: row.proyectoId,
  installationId: row.installationId,
  source: row.source,
  generatedAt: row.generatedAt.getTime(),
  receivedAt: row.receivedAt.getTime(),
  summary: row.summary,
  modules: row.modules,
  ...(row.metadata !== null ? { metadata: row.metadata } : {}),
});

/** Plain string comparison, like Mongo's default sort (Postgres would use the collation). */
export const byText =
  <T>(...keys: Array<(item: T) => string>) =>
  (a: T, b: T) => {
    for (const key of keys) {
      const left = key(a);
      const right = key(b);
      if (left !== right) return left < right ? -1 : 1;
    }
    return 0;
  };
