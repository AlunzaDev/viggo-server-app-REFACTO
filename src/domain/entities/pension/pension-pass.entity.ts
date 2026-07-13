import { CustomError } from "../../errors/custom.error";

export interface PensionPassEntityOptions {
    id: string;
    usuario?: string | null;
    name: string;
    pension: string;
    idPass: string;
    vigent: boolean;
    antiPassback: boolean;
    inParking: boolean;
    created: number;
    from: number;
    to: number;
    estado: boolean;
}

export class PensionPassEntity {
    public id: string;
    public usuario?: string | null;
    public name: string;
    public pension: string;
    public idPass: string;
    public vigent: boolean;
    public antiPassback: boolean;
    public inParking: boolean;
    public created: number;
    public from: number;
    public to: number;
    public estado: boolean;

    constructor(options: PensionPassEntityOptions) {
        const {
            id,
            usuario,
            name,
            pension,
            idPass,
            vigent,
            antiPassback,
            inParking,
            created,
            from,
            to,
            estado,
        } = options;

        this.id = id;
        this.usuario = usuario;
        this.name = name;
        this.pension = pension;
        this.idPass = idPass;
        this.vigent = vigent;
        this.antiPassback = antiPassback;
        this.inParking = inParking;
        this.created = created;
        this.from = from;
        this.to = to;
        this.estado = estado;
    }

    static fromObject(object: { [key: string]: unknown }): PensionPassEntity {
        const {
            _id,
            id,
            usuario,
            name,
            pension,
            idPass,
            vigent,
            antiPassback,
            inParking,
            created,
            from,
            to,
            estado,
        } = object;

        const pensionPassId = id || (_id ? String(_id) : undefined);

        if (!pensionPassId) throw CustomError.badRequest("Missing id");
        if (!name) throw CustomError.badRequest("Missing name");
        if (!pension) throw CustomError.badRequest("Missing pension");
        if (!idPass) throw CustomError.badRequest("Missing idPass");
        if (vigent === undefined || vigent === null) {
            throw CustomError.badRequest("Missing vigent");
        }
        if (antiPassback === undefined || antiPassback === null) {
            throw CustomError.badRequest("Missing antiPassback");
        }
        if (inParking === undefined || inParking === null) {
            throw CustomError.badRequest("Missing inParking");
        }
        if (created === undefined || created === null) {
            throw CustomError.badRequest("Missing created");
        }
        if (from === undefined || from === null) {
            throw CustomError.badRequest("Missing from");
        }
        if (to === undefined || to === null) {
            throw CustomError.badRequest("Missing to");
        }
        if (estado === undefined || estado === null) {
            throw CustomError.badRequest("Missing estado");
        }

        return new PensionPassEntity({
            id: String(pensionPassId),
            usuario: usuario ? String(usuario) : undefined,
            name: String(name).trim(),
            pension: String(pension),
            idPass: String(idPass).trim(),
            vigent: Boolean(vigent),
            antiPassback: Boolean(antiPassback),
            inParking: Boolean(inParking),
            created: Number(created),
            from: Number(from),
            to: Number(to),
            estado: Boolean(estado),
        });
    }
}
