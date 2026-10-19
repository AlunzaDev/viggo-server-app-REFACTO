import {
  PROVIDER_TIMEOUT_RANGE_MS,
  type PaymentProviderInput,
  type PaymentProviderIntegration,
} from "../../entities/parking/payment-provider.entity";

// The form may arrive as multipart (logo upload): every value can be a string.
const text = (value: unknown) => (typeof value === "string" ? value.trim() : undefined);
const bool = (value: unknown) =>
  typeof value === "boolean" ? value : value === "true" ? true : value === "false" ? false : undefined;
/** Multipart sends the mapping as JSON text; empty clears it. */
const mapping = (value: unknown): [string?, unknown?] => {
  if (value === undefined) return [];
  if (value === "" || value === null || value === "null") return [undefined, null];
  if (typeof value !== "string") return [undefined, value];
  try { return [undefined, JSON.parse(value)]; }
  catch { return ["'apiMapping' debe ser JSON valido"]; }
};

const integer = (value: unknown) => {
  if (value === undefined || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : Number.NaN;
};

/** Shape only; the rules on the whole configuration live in validatePaymentProviderConfig. */
export class PaymentProviderDto {
  static create(body: Record<string, unknown>): [string?, PaymentProviderInput?] {
    const nombre = text(body.nombre);
    if (!nombre) return ["'nombre' es requerido"];
    const [mappingError, apiMapping] = mapping(body.apiMapping);
    if (mappingError) return [mappingError];
    return [undefined, {
      nombre,
      logo: text(body.logo),
      integration: (text(body.integration) || "viggo") as PaymentProviderIntegration,
      adapter: text(body.adapter) ?? "",
      baseUrl: text(body.baseUrl) ?? "",
      credential: text(body.credential) || undefined,
      active: bool(body.active) ?? true,
      timeoutMs: integer(body.timeoutMs) ?? PROVIDER_TIMEOUT_RANGE_MS.default,
      authHeader: text(body.authHeader) ?? "",
      apiMapping: (apiMapping ?? null) as PaymentProviderInput["apiMapping"],
    }];
  }

  static update(body: Record<string, unknown>): [string?, Partial<PaymentProviderInput>?] {
    const nombre = text(body.nombre);
    if (nombre !== undefined && !nombre) return ["'nombre' no puede estar vacío"];
    const [mappingError, apiMapping] = mapping(body.apiMapping);
    if (mappingError) return [mappingError];
    const update: Partial<PaymentProviderInput> = {
      nombre,
      logo: text(body.logo),
      integration: text(body.integration) as PaymentProviderIntegration | undefined,
      adapter: text(body.adapter),
      baseUrl: text(body.baseUrl),
      // Empty means "keep the stored credential".
      credential: text(body.credential) || undefined,
      active: bool(body.active),
      timeoutMs: integer(body.timeoutMs),
      authHeader: text(body.authHeader),
      apiMapping: apiMapping as PaymentProviderInput["apiMapping"],
    };
    return [undefined, Object.fromEntries(Object.entries(update).filter(([, value]) => value !== undefined))];
  }
}
