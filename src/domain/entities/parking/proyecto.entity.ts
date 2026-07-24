import { CustomError } from "../../errors/custom.error";

export interface ProyectoEntityOptions {
    id: string;
    nombre: string;
    coordinates: number[];
    ciudad: string;
    identificador: string;
    codigoProyecto?: string;
    serverIp?: string;
    serverMac?: string;
    localApiBaseUrl?: string;
    img?: string;
    descripcion?: string;
    estado: boolean;
}

export class ProyectoEntity {
    public id: string;
    public nombre: string;
    public coordinates: number[];
    public ciudad: string;
    public identificador: string;
    public codigoProyecto?: string;
    public serverIp?: string;
    public serverMac?: string;
    public localApiBaseUrl?: string;
    public img?: string;
    public descripcion?: string;
    public estado: boolean;

    constructor(options: ProyectoEntityOptions) {
        const { id, nombre, coordinates, ciudad, identificador, codigoProyecto, serverIp, serverMac, localApiBaseUrl, img, descripcion, estado } =
            options;

        this.id = id;
        this.nombre = nombre;
        this.coordinates = coordinates;
        this.ciudad = ciudad;
        this.identificador = identificador;
        this.codigoProyecto = codigoProyecto;
        this.serverIp = serverIp;
        this.serverMac = serverMac;
        this.localApiBaseUrl = localApiBaseUrl;
        this.img = img;
        this.descripcion = descripcion;
        this.estado = estado;
    }

    static fromObject(object: { [key: string]: unknown }): ProyectoEntity {
        const { _id, id, nombre, coordinates, ciudad, identificador, codigoProyecto, serverIp, serverMac, localApiBaseUrl, img, descripcion, estado } =
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
            coordinates: coordinates.map((value) => Number(value)),
            ciudad: String(ciudad).trim(),
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
            img: typeof img === "string" ? img : undefined,
            descripcion: typeof descripcion === "string" ? descripcion : undefined,
            estado: Boolean(estado),
        });
    }
}
