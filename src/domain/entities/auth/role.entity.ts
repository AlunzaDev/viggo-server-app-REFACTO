import { CustomError } from "../../errors/custom.error";

export interface RoleEntityOptions {
    id: string;
    rol: string;
}

export class RoleEntity {
    public id: string;
    public rol: string;

    constructor(options: RoleEntityOptions) {
        const { id, rol } = options;
        this.id = id;
        this.rol = rol;
    }

    static fromObject(object: { [key: string]: unknown }): RoleEntity {
        const { _id, id, rol } = object;

        const roleId = id || (_id ? String(_id) : undefined);

        if (!roleId) throw CustomError.badRequest("Missing id");
        if (!rol) throw CustomError.badRequest("Missing rol");

        return new RoleEntity({
            id: String(roleId),
            rol: String(rol).trim(),
        });
    }
}
