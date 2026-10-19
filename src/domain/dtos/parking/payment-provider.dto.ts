export class PaymentProviderDto {
  private constructor(public readonly nombre: string, public readonly logo?: string) {}

  static create(body: Record<string, unknown>): [string?, PaymentProviderDto?] {
    const nombre = String(body.nombre ?? "").trim();
    if (!nombre) return ["'nombre' es requerido"];
    return [undefined, new PaymentProviderDto(nombre, typeof body.logo === "string" ? body.logo.trim() : undefined)];
  }

  static update(body: Record<string, unknown>): [string?, Partial<PaymentProviderDto>?] {
    const nombre = typeof body.nombre === "string" ? body.nombre.trim() : undefined;
    if (nombre !== undefined && !nombre) return ["'nombre' no puede estar vacío"];
    return [undefined, { nombre, logo: typeof body.logo === "string" ? body.logo.trim() : undefined }];
  }
}
