export class UpdatePensionPassDto {
    private constructor(
        public readonly name?: string,
        public readonly pension?: string,
        public readonly idPass?: string,
        public readonly vigent?: boolean,
        public readonly antiPassback?: boolean,
        public readonly inParking?: boolean,
        public readonly created?: number,
        public readonly from?: number,
        public readonly to?: number,
        public readonly estado?: boolean,
        public readonly usuario?: string,
    ) {}

    static create(body: Record<string, unknown>): [string?, UpdatePensionPassDto?] {
        return [
            undefined,
            new UpdatePensionPassDto(
                typeof body.name === "string" ? body.name.trim() : undefined,
                typeof body.pension === "string" ? body.pension.trim() : undefined,
                typeof body.idPass === "string" ? body.idPass.trim() : undefined,
                typeof body.vigent === "boolean" ? body.vigent : undefined,
                typeof body.antiPassback === "boolean" ? body.antiPassback : undefined,
                typeof body.inParking === "boolean" ? body.inParking : undefined,
                body.created !== undefined ? Number(body.created) : undefined,
                body.from !== undefined ? Number(body.from) : undefined,
                body.to !== undefined ? Number(body.to) : undefined,
                typeof body.estado === "boolean" ? body.estado : undefined,
                typeof body.usuario === "string" ? body.usuario.trim() : undefined,
            ),
        ];
    }
}
