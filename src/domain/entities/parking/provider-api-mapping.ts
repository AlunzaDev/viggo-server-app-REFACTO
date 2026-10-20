/**
 * How a provider's own API is spoken when it does not follow the Viggo standard: the requests
 * Viggo sends (method, path and body with variables) and where each datum is in its answers.
 * The generic adapter (mapped-provider.protocol.ts) reads this; no code per provider.
 *
 * Variables: `{name}` inside a path or a body string. In a path they are URL-encoded, so a QR
 * cannot alter it. A body string that is exactly one variable keeps its type ("{amount}" -> 125.5).
 */
export const QUOTE_VARIABLES = ["qr", "parkingId"] as const;
export const CONFIRM_VARIABLES = ["reference", "paymentReference", "amount", "amountMinor", "currency", "idempotencyKey"] as const;
export const STATUS_VARIABLES = ["reference", "idempotencyKey"] as const;

export const QUOTE_STATUSES = ["payable", "paid", "expired"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

/** pesos: 125.50 (number or text); centavos: 12550. */
export const AMOUNT_UNITS = ["pesos", "centavos"] as const;
/**
 * iso: date text; unixSeconds / unixMilliseconds: a moment; secondsLeft: seconds from now;
 * fixedMinutes: the provider does not say, the quote lasts `expiresMinutes`.
 */
export const EXPIRES_FORMATS = ["iso", "unixSeconds", "unixMilliseconds", "secondsLeft", "fixedMinutes"] as const;

export interface ProviderApiMapping {
  quote: {
    method: "GET" | "POST";
    /** Relative to the provider's baseUrl, e.g. "tickets/{qr}?estacionamiento={parkingId}". */
    path: string;
    /** POST only. Any JSON with variables. */
    body?: unknown;
    /** Field paths in the answer ("data.ticket.id", "items.0.monto"). */
    response: {
      reference: string;
      ticket: string;
      /** Default: the parking id Viggo sent. */
      parkingId?: string;
      /** Default: the parking id. */
      parkingName?: string;
      amount: string;
      amountUnit: (typeof AMOUNT_UNITS)[number];
      /** Path of the currency, or a fixed one (default MXN). */
      currency?: string;
      fixedCurrency?: string;
      expiresAt?: string;
      expiresFormat: (typeof EXPIRES_FORMATS)[number];
      expiresMinutes?: number;
      /** Without a status path every quote is payable (paid/missing tickets come as HTTP errors). */
      status?: string;
      /** The provider's value -> Viggo's, e.g. { "PENDIENTE": "payable", "PAGADO": "paid" }. */
      statusValues?: Record<string, QuoteStatus>;
    };
  };
  confirm: {
    method: "POST" | "PUT" | "PATCH";
    path: string;
    body?: unknown;
    /** Header the idempotency key goes in (default Idempotency-Key). */
    idempotencyHeader?: string;
    response: { confirmationReference: string };
  };
  /**
   * Optional: whether a confirmation was already applied (after a lost answer). Its "not found"
   * answer must be HTTP 404; any other answer is read as applied.
   */
  confirmStatus?: {
    method: "GET" | "POST";
    path: string;
    body?: unknown;
    response: { confirmationReference: string };
  };
}

const HEADER_NAME = /^[A-Za-z0-9-]{1,64}$/;
/** Headers the provider client sets itself. */
export const RESERVED_PROVIDER_HEADERS = new Set(["content-type", "content-length", "host", "x-viggo-request-id"]);
const FIELD_SEGMENT = /^[A-Za-z0-9_-]{1,64}$/;
const UNSAFE_SEGMENTS = new Set(["__proto__", "prototype", "constructor"]);
const VARIABLE = /\{([^{}]*)\}/g;
const MAX_BODY_LENGTH = 4096;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const isFieldPath = (value: unknown): value is string =>
  typeof value === "string" && value.length <= 256 &&
  value.split(".").every((segment) => FIELD_SEGMENT.test(segment) && !UNSAFE_SEGMENTS.has(segment));

const unknownVariable = (text: string, allowed: readonly string[]) =>
  [...text.matchAll(VARIABLE)].map((match) => match[1]).find((name) => !allowed.includes(name));

const checkPath = (path: unknown, allowed: readonly string[]): string | null => {
  if (typeof path !== "string" || !path.trim() || path.length > 512) return "es requerida (maximo 512 caracteres)";
  // Relative to the base URL and confined to it: no scheme, host, absolute path or parent segments.
  if (/^[/\\]/.test(path) || /[\\\s#]|:\/\/|%2e|(^|\/)\.\.?(\/|\?|$)/i.test(path)) return "debe ser relativa a la URL del proveedor, sin '..' ni '/' inicial";
  if (path.replace(VARIABLE, "").match(/[{}]/)) return "tiene llaves sin cerrar";
  const name = unknownVariable(path, allowed);
  return name === undefined ? null : `usa la variable desconocida {${name}}; disponibles: ${allowed.map((v) => `{${v}}`).join(", ")}`;
};

const checkBody = (body: unknown, allowed: readonly string[]): string | null => {
  let json: string | undefined;
  try { json = JSON.stringify(body); } catch { return "debe ser JSON"; }
  if (json === undefined || json.length > MAX_BODY_LENGTH) return `debe ser JSON de maximo ${MAX_BODY_LENGTH} caracteres`;
  const strings: string[] = [];
  const walk = (value: unknown): void => {
    if (typeof value === "string") strings.push(value);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (isRecord(value)) Object.entries(value).forEach(([key, item]) => { strings.push(key); walk(item); });
  };
  walk(body);
  for (const text of strings) {
    const name = unknownVariable(text, allowed);
    if (name !== undefined) return `usa la variable desconocida {${name}}; disponibles: ${allowed.map((v) => `{${v}}`).join(", ")}`;
  }
  return null;
};

/** Rules for a mapping; returns the first problem, in Spanish, or null. */
export const validateProviderApiMapping = (mapping: unknown, authHeader = ""): string | null => {
  if (!isRecord(mapping) || !isRecord(mapping.quote) || !isRecord(mapping.confirm)) {
    return "'apiMapping' debe tener la configuracion de cotizar (quote) y de confirmar (confirm)";
  }
  const { quote, confirm } = mapping;
  if (!["GET", "POST"].includes(quote.method as string)) return "'apiMapping.quote.method' debe ser GET o POST";
  const quotePath = checkPath(quote.path, QUOTE_VARIABLES);
  if (quotePath) return `'apiMapping.quote.path' ${quotePath}`;
  if (quote.body !== undefined) {
    if (quote.method === "GET") return "'apiMapping.quote.body' no aplica a GET";
    const error = checkBody(quote.body, QUOTE_VARIABLES);
    if (error) return `'apiMapping.quote.body' ${error}`;
  }

  const response = quote.response;
  if (!isRecord(response)) return "'apiMapping.quote.response' es requerida";
  for (const field of ["reference", "ticket", "amount"]) {
    if (!isFieldPath(response[field])) return `'apiMapping.quote.response.${field}' debe ser la ruta del dato (por ejemplo data.${field})`;
  }
  for (const field of ["parkingId", "parkingName", "currency", "expiresAt", "status"]) {
    if (response[field] !== undefined && !isFieldPath(response[field])) return `'apiMapping.quote.response.${field}' debe ser la ruta del dato`;
  }
  if (!AMOUNT_UNITS.includes(response.amountUnit as never)) return "'apiMapping.quote.response.amountUnit' debe ser pesos o centavos";
  if (response.fixedCurrency !== undefined && (typeof response.fixedCurrency !== "string" || !/^[A-Za-z]{3}$/.test(response.fixedCurrency))) {
    return "'apiMapping.quote.response.fixedCurrency' debe ser un codigo de 3 letras (MXN)";
  }
  if (!EXPIRES_FORMATS.includes(response.expiresFormat as never)) {
    return `'apiMapping.quote.response.expiresFormat' debe ser uno de: ${EXPIRES_FORMATS.join(", ")}`;
  }
  if (response.expiresFormat === "fixedMinutes") {
    const minutes = response.expiresMinutes;
    if (!Number.isInteger(minutes) || (minutes as number) < 1 || (minutes as number) > 1440) {
      return "'apiMapping.quote.response.expiresMinutes' debe ser de 1 a 1440 minutos";
    }
  } else if (!isFieldPath(response.expiresAt)) {
    return "'apiMapping.quote.response.expiresAt' es requerida salvo con vigencia fija (fixedMinutes)";
  }
  if (response.status !== undefined) {
    const values = response.statusValues;
    if (!isRecord(values) || !Object.keys(values).length || Object.keys(values).length > 32 ||
      Object.entries(values).some(([key, value]) => !key || key.length > 64 || !QUOTE_STATUSES.includes(value as never))) {
      return "'apiMapping.quote.response.statusValues' debe traducir sus estados a payable, paid o expired";
    }
    if (!Object.values(values).includes("payable")) return "'apiMapping.quote.response.statusValues' debe indicar que estado es por pagar (payable)";
  }

  if (!["POST", "PUT", "PATCH"].includes(confirm.method as string)) return "'apiMapping.confirm.method' debe ser POST, PUT o PATCH";
  const confirmPath = checkPath(confirm.path, CONFIRM_VARIABLES);
  if (confirmPath) return `'apiMapping.confirm.path' ${confirmPath}`;
  if (confirm.body !== undefined) {
    const error = checkBody(confirm.body, CONFIRM_VARIABLES);
    if (error) return `'apiMapping.confirm.body' ${error}`;
  }
  const header = confirm.idempotencyHeader;
  if (header !== undefined && header !== "" && (typeof header !== "string" || !HEADER_NAME.test(header) ||
    RESERVED_PROVIDER_HEADERS.has(header.toLowerCase()) || header.toLowerCase() === authHeader.toLowerCase() ||
    (!authHeader && header.toLowerCase() === "authorization"))) {
    return "'apiMapping.confirm.idempotencyHeader' debe ser un encabezado valido distinto al de la credencial";
  }
  if (!isRecord(confirm.response) || !isFieldPath(confirm.response.confirmationReference)) {
    return "'apiMapping.confirm.response.confirmationReference' debe ser la ruta de su comprobante";
  }

  const status = mapping.confirmStatus;
  if (status === undefined || status === null) return null;
  if (!isRecord(status)) return "'apiMapping.confirmStatus' debe describir la consulta de estado";
  if (!["GET", "POST"].includes(status.method as string)) return "'apiMapping.confirmStatus.method' debe ser GET o POST";
  const statusPath = checkPath(status.path, STATUS_VARIABLES);
  if (statusPath) return `'apiMapping.confirmStatus.path' ${statusPath}`;
  if (status.body !== undefined) {
    if (status.method === "GET") return "'apiMapping.confirmStatus.body' no aplica a GET";
    const error = checkBody(status.body, STATUS_VARIABLES);
    if (error) return `'apiMapping.confirmStatus.body' ${error}`;
  }
  if (!isRecord(status.response) || !isFieldPath(status.response.confirmationReference)) {
    return "'apiMapping.confirmStatus.response.confirmationReference' debe ser la ruta de su comprobante";
  }
  return null;
};
