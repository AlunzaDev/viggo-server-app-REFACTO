import { PostgresDatabase } from "../../../data/postgres";
import type { Prisma } from "../../../generated/prisma/client";
import { UsuarioDatasource } from "../../../domain/datasources/auth/usuario.datasource";
import { UsuarioEntity } from "../../../domain/entities/auth/usuario.entity";
import { CustomError } from "../../../domain/errors/custom.error";
import { deleteManagedUserImage } from "../../../config/plugins/user-image.plugin";
import { isUuid, withPrismaErrors } from "../postgres/prisma-errors";
import {
  toAppPermissionRows,
  toParkingRows,
  toUsuarioEntity,
  toUsuarioScalars,
  usuarioInclude,
} from "./usuario.prisma-mapper";

const invalidReference = CustomError.badRequest(
  "Un estacionamiento o perfil de permisos asignado no existe",
);
const usuarioInUse = CustomError.conflict(
  "No se puede eliminar el usuario porque tiene pagos, pensiones u otros registros asociados",
);

/** Writes scalars plus parkings/appPermissions (replaced as a whole when provided). */
export const writeUsuario = async (
  tx: Prisma.TransactionClient,
  id: string,
  usuario: Partial<Omit<UsuarioEntity, "id">>,
) => {
  if (usuario.parkings !== undefined) {
    await tx.usuarioParking.deleteMany({ where: { usuarioId: id } });
    await tx.usuarioParking.createMany({
      data: toParkingRows(usuario.parkings).map((row) => ({ ...row, usuarioId: id })),
    });
  }
  if (usuario.appPermissions !== undefined) {
    await tx.usuarioAppPermission.deleteMany({ where: { usuarioId: id } });
    await tx.usuarioAppPermission.createMany({
      data: toAppPermissionRows(usuario.appPermissions).map((row) => ({ ...row, usuarioId: id })),
    });
  }
  return tx.usuario.update({ where: { id }, data: toUsuarioScalars(usuario), include: usuarioInclude });
};

export const createUsuario = (usuario: Omit<UsuarioEntity, "id">) =>
  withPrismaErrors(
    () =>
      PostgresDatabase.client.usuario.create({
        data: {
          ...toUsuarioScalars(usuario),
          nombre: usuario.nombre,
          apellido: usuario.apellido,
          correo: usuario.correo.trim().toLowerCase(),
          telefono: usuario.telefono,
          password: usuario.password,
          parkings: { create: toParkingRows(usuario.parkings ?? []) },
          appPermissions: { create: toAppPermissionRows(usuario.appPermissions ?? []) },
        },
        include: usuarioInclude,
      }),
    { foreignKey: invalidReference },
  ).then(toUsuarioEntity);

export const findUsuario = async (where: Prisma.UsuarioWhereUniqueInput) => {
  const row = await PostgresDatabase.client.usuario.findUnique({ where, include: usuarioInclude });
  return row ? toUsuarioEntity(row) : null;
};

export class UsuarioPostgresDatasource extends UsuarioDatasource {
  async create(usuario: Omit<UsuarioEntity, "id">): Promise<UsuarioEntity> {
    try {
      return await createUsuario(usuario);
    } catch (error) {
      deleteManagedUserImage(usuario.img);
      throw error;
    }
  }

  findById(id: string): Promise<UsuarioEntity | null> {
    return isUuid(id) ? findUsuario({ id }) : Promise.resolve(null);
  }

  findByCorreo(correo: string): Promise<UsuarioEntity | null> {
    return findUsuario({ correo: correo.trim().toLowerCase() });
  }

  findByTelefono(telefono: string): Promise<UsuarioEntity | null> {
    return findUsuario({ telefono });
  }

  async getAll(): Promise<UsuarioEntity[]> {
    const rows = await PostgresDatabase.client.usuario.findMany({
      include: usuarioInclude,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map(toUsuarioEntity);
  }

  async update(id: string, usuario: Partial<Omit<UsuarioEntity, "id">>): Promise<UsuarioEntity | null> {
    const existing = isUuid(id)
      ? await PostgresDatabase.client.usuario.findUnique({ where: { id }, select: { img: true } })
      : null;

    if (!existing) {
      deleteManagedUserImage(usuario.img);
      return null;
    }

    const previousImage = existing.img.trim();
    const nextImage = typeof usuario.img === "string" ? usuario.img.trim() : undefined;

    try {
      const row = await withPrismaErrors(
        () => PostgresDatabase.client.$transaction((tx) => writeUsuario(tx, id, usuario)),
        { foreignKey: invalidReference },
      );

      if (nextImage !== undefined && nextImage !== previousImage) {
        deleteManagedUserImage(previousImage);
      }

      return toUsuarioEntity(row);
    } catch (error) {
      if (nextImage && nextImage !== previousImage) {
        deleteManagedUserImage(nextImage);
      }
      throw error;
    }
  }

  async delete(id: string): Promise<UsuarioEntity | null> {
    if (!isUuid(id)) return null;

    const usuario = await findUsuario({ id });
    if (!usuario) return null;

    await withPrismaErrors(() => PostgresDatabase.client.usuario.delete({ where: { id } }), {
      foreignKey: usuarioInUse,
    });
    deleteManagedUserImage(String(usuario.img ?? ""));
    return usuario;
  }
}
