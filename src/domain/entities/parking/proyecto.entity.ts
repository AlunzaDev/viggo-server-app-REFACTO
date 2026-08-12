import { CustomError } from "../../errors/custom.error";
import {
    parseRemoteSupportProvider,
    RemoteSupportProvider,
} from "./remote-support.entity";

export type ProyectoRemoteSupportProvider = RemoteSupportProvider;

export interface ProyectoRemoteSupport {
    provider: ProyectoRemoteSupportProvider;
    enabled: boolean;
    baseUrl?: string;
    groupId?: string;
}

export interface ProyectoEntityOptions {
    id: string;
    nombre: string;
    coordinates: number[] | number[][];
    ciudad: string;
    direccion?: string;
    identificador: string;
    codigoProyecto?: string;
    serverIp?: string;
    serverMac?: string;
    localApiBaseUrl?: string;
    remoteSupport?: ProyectoRemoteSupport | null;
    img?: string;
    descripcion?: string;
    estado: boolean;
}

export class ProyectoEntity {
    public id: string;
    public nombre: string;
    public coordinates: number[] | number[][];
    public ciudad: string;
    public direccion?: string;
    public identificador: string;
    public codigoProyecto?: string;
    public serverIp?: string;
    public serverMac?: string;
    public localApiBaseUrl?: string;
    public remoteSupport?: ProyectoRemoteSupport | null;
    public img?: string;
    public descripcion?: string;
    public estado: boolean;

    constructor(options: ProyectoEntityOptions) {
        const { id, nombre, coordinates, ciudad, direccion, identificador, codigoProyecto, serverIp, serverMac, localApiBaseUrl, remoteSupport, img, descripcion, estado } =
            options;

        this.id = id;
        this.nombre = nombre;
        this.coordinates = coordinates;
        this.ciudad = ciudad;
        this.direccion = direccion;
        this.identificador = identificador;
        this.codigoProyecto = codigoProyecto;
        this.serverIp = serverIp;
        this.serverMac = serverMac;
        this.localApiBaseUrl = localApiBaseUrl;
        this.remoteSupport = remoteSupport;
        this.img = img;
        this.descripcion = descripcion;
        this.estado = estado;
    }

    static fromObject(object: { [key: string]: unknown }): ProyectoEntity {
        const { _id, id, nombre, coordinates, ciudad, direccion, identificador, codigoProyecto, serverIp, serverMac, localApiBaseUrl, remoteSupport, img, descripcion, estado } =
            object;

        const proyectoId = id || (_id ? String(_id) : undefined);

        if (!proyectoId) throw CustomError.badRequest("Missing id");
        if (!nombre) throw CustomError.badRequest("Missing nombre");
        if (!Array.isArray(coordinates)) throw CustomError.badRequest("Missing coordinates");
        if (!ciudad) throw CustomError.badRequest("Missing ciudad");
        if (!identificador) throw CustomError.badRequest("Missing identificador");
        if (estado === undefined || estado === null) {
            throw CustomError.badRequest("Missing estado");
        }

        return new ProyectoEntity({
            id: String(proyectoId),
            nombre: String(nombre).trim(),
            coordinates: ProyectoEntity.parseCoordinates(coordinates),
            ciudad: String(ciudad).trim(),
            direccion:
                typeof direccion === "string" && direccion.trim().length > 0
                    ? direccion.trim()
                    : undefined,
            identificador: String(identificador).trim(),
            codigoProyecto:
                typeof codigoProyecto === "string" && codigoProyecto.trim().length > 0
                    ? codigoProyecto.trim()
                    : undefined,
            serverIp:
                typeof serverIp === "string" && serverIp.trim().length > 0
                    ? serverIp.trim()
                    : undefined,
            serverMac:
                typeof serverMac === "string" && serverMac.trim().length > 0
                    ? serverMac.trim().toUpperCase()
                    : undefined,
            localApiBaseUrl:
                typeof localApiBaseUrl === "string" && localApiBaseUrl.trim().length > 0
                    ? localApiBaseUrl.trim()
                    : undefined,
            remoteSupport: ProyectoEntity.parseRemoteSupport(remoteSupport),
            img: typeof img === "string" ? img : undefined,
            descripcion: typeof descripcion === "string" ? descripcion : undefined,
            estado: Boolean(estado),
        });
    }

    private static parseRemoteSupport(value: unknown): ProyectoRemoteSupport | null {
        if (!value || typeof value !== "object" || Array.isArray(value)) return null;

        const source = value as Record<string, unknown>;
        const provider = parseRemoteSupportProvider(source.provider);
        const baseUrl = typeof source.baseUrl === "string" ? source.baseUrl.trim() : "";
        const groupId = typeof source.groupId === "string" ? source.groupId.trim() : "";
        const enabled = Boolean(source.enabled) || baseUrl.length > 0 || groupId.length > 0;

        if (!provider) return null;
        if (!enabled && !baseUrl) return null;

        return {
            provider,
            enabled,
            baseUrl: baseUrl || undefined,
            groupId: groupId || undefined,
        };
    }

    private static parseCoordinates(value: unknown[]): number[] | number[][] {
        if (
            value.length >= 2 &&
            !Array.isArray(value[0]) &&
            Number.isFinite(Number(value[0])) &&
            Number.isFinite(Number(value[1]))
        ) {
            return [Number(value[0]), Number(value[1])];
        }

        const points = value
            .map((item) =>
                Array.isArray(item) && item.length >= 2
                    ? [Number(item[0]), Number(item[1])]
                    : null,
            )
            .filter((item): item is number[] => Boolean(item))
            .filter((item) => Number.isFinite(item[0]) && Number.isFinite(item[1]));

        if (!points.length) {
            throw CustomError.badRequest("Invalid coordinates");
        }

        return points;
    }
}
