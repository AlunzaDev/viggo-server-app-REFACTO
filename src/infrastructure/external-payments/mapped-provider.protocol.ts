import type { ExternalQuote } from "../../domain/external-payments/external-payment";
import type { ProviderApiMapping } from "../../domain/entities/parking/provider-api-mapping";
import { CustomError } from "../../domain/errors/custom.error";
import type { ProviderProtocol } from "./http-provider.client";

type Variables = Record<string, string | number>;

const VARIABLE = /\{([^{}]*)\}/g;
const DECIMAL = /^\d{1,9}(\.\d{1,2})?$/;

/** Path with URL-encoded variables; a value that would be a "." or ".." segment is refused. */
const fillPath = (template: string, variables: Variables, invalid: () => Error) =>
  template.replace(VARIABLE, (_, name: string) => {
    const value = String(variables[name]);
    if (value === "." || value === "..") throw invalid();
    return encodeURIComponent(value);
  });

/** JSON with variables: "{amount}" alone keeps its type, inside text it is interpolated. */
const fillBody = (template: unknown, variables: Variables): unknown => {
  if (typeof template === "string") {
    const exact = /^\{([^{}]*)\}$/.exec(template);
    if (exact) return variables[exact[1]];
    return template.replace(VARIABLE, (_, name: string) => String(variables[name]));
  }
  if (Array.isArray(template)) return template.map((item) => fillBody(item, variables));
  if (template && typeof template === "object") {
    return Object.fromEntries(Object.entries(template).map(([key, value]) => [fillBody(key, variables) as string, fillBody(value, variables)]));
  }
  return template;
};

/** Value at "a.b.0.c" (own properties only). */
const read = (value: unknown, path: string): unknown =>
  path.split(".").reduce<unknown>((current, segment) =>
    current !== null && typeof current === "object" && Object.hasOwn(current, segment)
      ? (current as Record<string, unknown>)[segment]
      : undefined, value);

/** Text or numeric ids, as text. Readers throw on anything else: the client answers "invalid response". */
const text = (value: unknown) => {
  const result = typeof value === "number" && Number.isFinite(value) ? String(value) : value;
  if (typeof result !== "string" || !result.trim() || result.length > 256) throw new Error("Expected text");
  return result.trim();
};

const number = (value: unknown) => {
  const result = typeof value === "string" && value.trim() ? Number(value.trim()) : value;
  if (typeof result !== "number" || !Number.isFinite(result)) throw new Error("Expected a number");
  return result;
};

/** To centavos without float drift: pesos with at most 2 decimals, centavos as an integer. */
const toMinor = (value: unknown, unit: ProviderApiMapping["quote"]["response"]["amountUnit"]) => {
  const raw = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  if (unit === "centavos") {
    if (!/^\d{1,11}$/.test(raw)) throw new Error("Invalid amount");
    return Number(raw);
  }
  if (!DECIMAL.test(raw)) throw new Error("Invalid amount");
  const [whole, cents = ""] = raw.split(".");
  return Number(whole) * 100 + Number(cents.padEnd(2, "0"));
};

/**
 * Generic adapter: speaks a provider's own API from its mapping (configured in the catalog).
 * Amount and currency limits are still enforced by the payment service, as for the standard.
 */
export const mappedProviderProtocol = (mapping: ProviderApiMapping, now: () => number = Date.now): ProviderProtocol => {
  const { quote, confirm } = mapping;
  const answer = quote.response;
  const amountOf = (minor: number) => (answer.amountUnit === "centavos" ? minor : Number((minor / 100).toFixed(2)));

  return {
    idempotencyHeader: confirm.idempotencyHeader || undefined,

    quoteRequest(qr, parkingId) {
      const variables = { qr, parkingId };
      return {
        method: quote.method,
        path: fillPath(quote.path, variables, () => CustomError.badRequest("QR invalido")),
        ...(quote.method === "POST" ? { body: fillBody(quote.body ?? {}, variables) } : {}),
      };
    },

    readQuote(body, requestedParkingId): ExternalQuote {
      const field = (path: string) => read(body, path);
      const expiresAt = (() => {
        const value = answer.expiresAt ? field(answer.expiresAt) : undefined;
        switch (answer.expiresFormat) {
          case "iso": { const time = Date.parse(text(value)); if (!Number.isFinite(time)) throw new Error("Invalid date"); return time; }
          case "unixSeconds": return number(value) * 1000;
          case "unixMilliseconds": return number(value);
          case "secondsLeft": return now() + number(value) * 1000;
          case "fixedMinutes": return now() + (answer.expiresMinutes ?? 0) * 60_000;
          default: throw new Error("Unknown expiration format");
        }
      })();
      let status: ExternalQuote["status"] = "payable";
      if (answer.status) {
        const value = text(field(answer.status));
        const translated = answer.statusValues && Object.hasOwn(answer.statusValues, value) ? answer.statusValues[value] : undefined;
        if (!translated) throw new Error("Unknown status");
        status = translated;
      }
      const parkingId = answer.parkingId ? text(field(answer.parkingId)) : requestedParkingId;
      return {
        reference: text(field(answer.reference)),
        ticket: text(field(answer.ticket)),
        parking: {
          id: parkingId,
          name: answer.parkingName ? text(field(answer.parkingName)) : parkingId,
        },
        amountMinor: toMinor(field(answer.amount), answer.amountUnit),
        currency: (answer.currency ? text(field(answer.currency)) : answer.fixedCurrency || "MXN").toUpperCase(),
        expiresAt: Math.trunc(expiresAt),
        status,
      };
    },

    confirmationRequest({ reference, paymentReference, amountMinor, currency, idempotencyKey }) {
      const variables = { reference, paymentReference, amount: amountOf(amountMinor), amountMinor, currency, idempotencyKey };
      return {
        method: confirm.method,
        // A reference that cannot go in the path is a final answer: the order goes to review.
        path: fillPath(confirm.path, variables, () =>
          new CustomError(502, "Referencia del proveedor no valida para su API", "EXTERNAL_PROVIDER_REJECTED")),
        body: fillBody(confirm.body ?? {}, variables),
      };
    },

    readConfirmation: (body) => ({ confirmationReference: text(read(body, confirm.response.confirmationReference)) }),
  };
};
