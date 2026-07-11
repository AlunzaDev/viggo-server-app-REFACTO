export class CreatePensionPassDto {
    private constructor(
        public readonly name: string,
        public readonly pension: string,
        public readonly idPass: string,
        public readonly vigent: boolean,
        public readonly antiPassback: boolean,
        public readonly inParking: boolean,
        public readonly created: number,
        public readonly from: number,
        public readonly to: number,
        public readonly estado: boolean,
        public readonly usuario?: string,
    ) {}

    static create(body: Record<string, unknown>): [string?, CreatePensionPassDto?] {
        const name = typeof body.name === "string" ? body.name.trim() : "";
        const pension = typeof body.pension === "string" ? body.pension.trim() : "";
        const idPass = typeof body.idPass === "string" ? body.idPass.trim() : "";
        const vigent = typeof body.vigent === "boolean" ? body.vigent : false;
        const antiPassback =
            typeof body.antiPassback === "boolean" ? body.antiPassback : true;
        const inParking = typeof body.inParking === "boolean" ? body.inParking : false;
        const created = Number(body.created);
        const from = body.from === undefined ? -1 : Number(body.from);
        const to = body.to === undefined ? -1 : Number(body.to);
        const estado = typeof body.estado === "boolean" ? body.estado : true;
        const usuario = typeof body.usuario === "string" ? body.usuario.trim() : undefined;

        if (!name) return ["'name' es requerido"];
        if (!pension) return ["'pension' es requerido"];
        if (!idPass) return ["'idPass' es requerido"];
        if (!Number.isFinite(created)) return ["'created' es requerido"];

        return [
            undefined,
            new CreatePensionPassDto(
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
                usuario,
            ),
        ];
    }
}
