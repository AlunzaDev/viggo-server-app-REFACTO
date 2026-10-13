import type { Prisma } from "../../../generated/prisma/client";
import { CustomError } from "../../../domain/errors/custom.error";
import { UsuarioEntity, type UserAppPermission } from "../../../domain/entities/auth/usuario.entity";
import { fromEpochMs, isUuid, toEpochMs } from "../postgres/prisma-errors";

/** Relations needed to build a UsuarioEntity (parkings and per-app permission profiles). */
export const usuarioInclude = {
  parkings: { select: { proyectoId: true } },
  appPermissions: { select: { app: true, permissionProfileId: true } },
} satisfies Prisma.UsuarioInclude;

export type UsuarioRow = Prisma.UsuarioGetPayload<{ include: typeof usuarioInclude }>;

export const toUsuarioEntity = (row: UsuarioRow): UsuarioEntity =>
  UsuarioEntity.fromObject({
    id: row.id,
    nombre: row.nombre,
    apellido: row.apellido,
    correo: row.correo,
    telefono: row.telefono,
    coordinates: row.coordinates ?? [],
    password: row.password,
    emailValidated: row.emailValidated,
    rol: row.rol,
    parkings: row.parkings.map((parking) => parking.proyectoId),
    nacimiento: toEpochMs(row.nacimiento),
    img: row.img,
    estado: row.estado,
    google: row.google,
    allowedApps: row.allowedApps,
    appPermissions: row.appPermissions,
  });

type UsuarioInput = Partial<Omit<UsuarioEntity, "id">>;

/** Scalar columns of usuarios; undefined fields are left untouched by Prisma. */
export const toUsuarioScalars = (usuario: UsuarioInput) => ({
  nombre: usuario.nombre,
  apellido: usuario.apellido,
  correo: usuario.correo?.trim().toLowerCase(),
  telefono: usuario.telefono,
  coordinates: usuario.coordinates,
  password: usuario.password,
  emailValidated: usuario.emailValidated,
  rol: usuario.rol,
  allowedApps: usuario.allowedApps,
  nacimiento: fromEpochMs(usuario.nacimiento),
  img: usuario.img,
  estado: usuario.estado,
  google: usuario.google,
});

/** Rows for usuario_parkings, deduplicated like the entity does. */
export const toParkingRows = (parkings: string[]) => {
  const ids = Array.from(new Set(parkings));
  if (!ids.every(isUuid)) throw CustomError.badRequest("Uno o más estacionamientos no son válidos");
  return ids.map((proyectoId) => ({ proyectoId }));
};

/** One profile per app, last one wins, like the entity normalization. */
export const toAppPermissionRows = (permissions: UserAppPermission[]) => {
  const rows = Array.from(new Map(permissions.map((permission) => [permission.app, permission])).values());
  if (!rows.every((permission) => isUuid(permission.permissionProfileId))) {
    throw CustomError.badRequest("Uno o más perfiles de permisos no son válidos");
  }
  return rows.map((permission) => ({ app: permission.app, permissionProfileId: permission.permissionProfileId }));
};
