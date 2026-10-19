import { CustomError } from "../../errors/custom.error";

export class PaymentProviderEntity {
  constructor(
    public readonly id: string,
    public readonly nombre: string,
    public readonly logo: string = "",
  ) {}

  static fromObject(value: Record<string, unknown>) {
    const id = String(value.id ?? "").trim();
    const nombre = String(value.nombre ?? "").trim();
    if (!id) throw CustomError.badRequest("Missing provider id");
    if (!nombre) throw CustomError.badRequest("Missing provider nombre");
    return new PaymentProviderEntity(id, nombre, String(value.logo ?? "").trim());
  }
}
