import { CustomError } from "../../errors/custom.error";

/**
 * How a provider charges: `viggo` is Viggo's own ticket flow (OPERATIVO); `standard` is any
 * provider implementing docs/api-proveedores.md (configuration only); `adapter` is an
 * integration coded for one provider that does not follow the standard.
 */
export const PAYMENT_PROVIDER_INTEGRATIONS = ["viggo", "standard", "adapter"] as const;
export type PaymentProviderIntegration = (typeof PAYMENT_PROVIDER_INTEGRATIONS)[number];

/** Adapters coded in the backend. */
export const PAYMENT_PROVIDER_ADAPTERS = ["seguripass"] as const;

/** Headers the provider client sets itself: a credential cannot go in them. */
const RESERVED_AUTH_HEADERS = new Set(["content-type", "content-length", "host", "idempotency-key", "x-viggo-request-id"]);
const HEADER_NAME = /^[A-Za-z0-9-]{1,64}$/;

export const PROVIDER_TIMEOUT_RANGE_MS = { min: 1000, max: 30_000, default: 8000 } as const;

export class PaymentProviderEntity {
  constructor(
    public readonly id: string,
    public readonly nombre: string,
    public readonly logo: string = "",
    public readonly integration: PaymentProviderIntegration = "viggo",
    public readonly adapter: string = "",
    public readonly baseUrl: string = "",
    /** The credential itself is never exposed: only whether one is stored. */
    public readonly hasCredential: boolean = false,
    public readonly active: boolean = true,
    public readonly timeoutMs: number = PROVIDER_TIMEOUT_RANGE_MS.default,
    /** Empty: `Authorization: Bearer <credential>`; a name: the credential as is in that header. */
    public readonly authHeader: string = "",
  ) {}

  static fromObject(value: Record<string, unknown>) {
    const id = String(value.id ?? "").trim();
    const nombre = String(value.nombre ?? "").trim();
    if (!id) throw CustomError.badRequest("Missing provider id");
    if (!nombre) throw CustomError.badRequest("Missing provider nombre");
    const integration = PAYMENT_PROVIDER_INTEGRATIONS.includes(value.integration as PaymentProviderIntegration)
      ? (value.integration as PaymentProviderIntegration)
      : "viggo";
    return new PaymentProviderEntity(
      id,
      nombre,
      String(value.logo ?? "").trim(),
      integration,
      String(value.adapter ?? "").trim(),
      String(value.baseUrl ?? "").trim(),
      Boolean(value.hasCredential),
      value.active !== false,
      Number(value.timeoutMs ?? PROVIDER_TIMEOUT_RANGE_MS.default),
      String(value.authHeader ?? "").trim(),
    );
  }
}

/** What an administrator sends; `credential` is write-only (empty keeps the stored one). */
export interface PaymentProviderInput {
  nombre: string;
  logo?: string;
  integration: PaymentProviderIntegration;
  adapter: string;
  baseUrl: string;
  credential?: string;
  active: boolean;
  timeoutMs: number;
  /** Empty: Bearer in Authorization. A name (e.g. X-API-Key): the credential as is in it. */
  authHeader: string;
}

/**
 * Rules for a provider's configuration as a whole (after merging an update). External
 * integrations need an HTTPS API and a credential; plain http to this machine is accepted
 * outside production so the reference server can be used.
 */
export const validatePaymentProviderConfig = (
  config: Omit<PaymentProviderInput, "credential" | "logo"> & { hasCredential: boolean },
  options: { allowLocalHttp: boolean },
): string | null => {
  if (!config.nombre.trim()) return "'nombre' es requerido";
  if (!PAYMENT_PROVIDER_INTEGRATIONS.includes(config.integration)) return "'integration' debe ser viggo, standard o adapter";
  if (!Number.isInteger(config.timeoutMs) || config.timeoutMs < PROVIDER_TIMEOUT_RANGE_MS.min || config.timeoutMs > PROVIDER_TIMEOUT_RANGE_MS.max) {
    return `'timeoutMs' debe estar entre ${PROVIDER_TIMEOUT_RANGE_MS.min} y ${PROVIDER_TIMEOUT_RANGE_MS.max}`;
  }
  if (config.integration === "viggo") return null;

  if (config.authHeader && (!HEADER_NAME.test(config.authHeader) || RESERVED_AUTH_HEADERS.has(config.authHeader.toLowerCase()))) {
    return "'authHeader' debe ser un nombre de encabezado valido (por ejemplo X-API-Key)";
  }
  if (config.integration === "adapter" && !PAYMENT_PROVIDER_ADAPTERS.includes(config.adapter as never)) {
    return `'adapter' debe ser uno de: ${PAYMENT_PROVIDER_ADAPTERS.join(", ")}`;
  }
  let url: URL;
  try {
    url = new URL(config.baseUrl);
  } catch {
    return "'baseUrl' debe ser una URL valida";
  }
  const local = ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(options.allowLocalHttp && local && url.protocol === "http:")) {
    return "'baseUrl' debe usar HTTPS";
  }
  if (url.username || url.password || url.search || url.hash) return "'baseUrl' no debe llevar usuario, parametros ni fragmento";
  if (!config.hasCredential) return "'credential' es requerida para un proveedor externo";
  return null;
};
