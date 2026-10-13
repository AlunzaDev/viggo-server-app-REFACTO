import { randomUUID } from "node:crypto";
import type { Prisma } from "../../../generated/prisma/client";
import type { ModuloSubmoduloDtoValues } from "../../../domain/dtos/parking/modulo-submodulo.dto";
import {
  ModuloEntity,
  type ModuloRemoteSupport,
  type ModuloSubmodulo,
} from "../../../domain/entities/parking/modulo.entity";

export const moduloInclude = {
  submodulos: { orderBy: { position: "asc" } },
  remoteSupport: true,
  deviceState: true,
} satisfies Prisma.ModuloInclude;

export type ModuloRow = Prisma.ModuloGetPayload<{ include: typeof moduloInclude }>;

const toCoordinates = (longitude: number | null, latitude: number | null): [number, number] | undefined =>
  longitude !== null && latitude !== null ? [longitude, latitude] : undefined;

/** [lon, lat] -> columns; [] clears them; undefined leaves them untouched. */
export const fromCoordinates = (coordinates: number[] | undefined) => {
  if (coordinates === undefined) return {};
  return coordinates.length === 2
    ? { longitude: Number(coordinates[0]), latitude: Number(coordinates[1]) }
    : { longitude: null, latitude: null };
};

export const toModuloEntity = (row: ModuloRow): ModuloEntity => {
  const state = row.deviceState;
  return ModuloEntity.fromObject({
    id: row.id,
    nombre: row.nombre,
    proyecto: row.proyectoId,
    tipo: row.tipo,
    estado: row.estado,
    identificador: row.identificador,
    ip: row.ip,
    mac: row.mac,
    ubicacion: row.ubicacion,
    coordinates: toCoordinates(row.longitude, row.latitude),
    descripcion: row.descripcion,
    deviceBinding: state?.binding ?? null,
    deviceBindingRequests: state?.bindingRequests ?? [],
    deviceRuntimeSnapshot: state
      ? {
          fingerprint: state.fingerprint,
          socketId: state.socketId,
          ipAddress: state.ipAddress,
          locationLabel: state.locationLabel,
          connectionStatus: state.connectionStatus,
          heartbeatStatus: state.heartbeatStatus,
          isConnected: state.isConnected,
          isAuthorized: state.isAuthorized,
          connectedAt: state.connectedAt,
          lastHeartbeatAt: state.lastHeartbeatAt,
          lastDisconnectAt: state.lastDisconnectAt,
          message: state.message,
          sourceInstallationId: state.sourceInstallationId,
          syncedAt: state.syncedAt,
        }
      : null,
    remoteSupport: row.remoteSupport,
    submodulos: row.submodulos.map((submodulo) => ({
      ...submodulo,
      coordinates: toCoordinates(submodulo.longitude, submodulo.latitude),
    })),
  });
};

/** Columns of a sub-module, with the same defaults Mongo applied. */
export const toSubmoduloData = (submodulo: ModuloSubmoduloDtoValues | ModuloSubmodulo) => ({
  submoduloId: submodulo.submoduloId || randomUUID(),
  nombre: submodulo.nombre,
  tipo: submodulo.tipo,
  identificador: submodulo.identificador ?? "",
  ip: submodulo.ip ?? "",
  mac: submodulo.mac ?? "",
  ubicacion: submodulo.ubicacion ?? "",
  ...fromCoordinates(submodulo.coordinates ?? []),
  descripcion: submodulo.descripcion ?? "",
  estado: submodulo.estado ?? true,
});

export const toRemoteSupportData = (remoteSupport: ModuloRemoteSupport) => ({
  provider: remoteSupport.provider,
  enabled: remoteSupport.enabled,
  deviceName: remoteSupport.deviceName ?? "",
  deviceId: remoteSupport.deviceId ?? "",
  groupId: remoteSupport.groupId ?? "",
  baseUrl: remoteSupport.baseUrl ?? "",
  supportUrl: remoteSupport.supportUrl ?? "",
  desktopUrl: remoteSupport.desktopUrl ?? "",
  terminalUrl: remoteSupport.terminalUrl ?? "",
  linkedAt: remoteSupport.linkedAt ?? null,
  updatedAt: remoteSupport.updatedAt ?? new Date(),
});
