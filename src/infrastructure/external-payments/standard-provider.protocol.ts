import type { ExternalQuote } from "../../domain/external-payments/external-payment";
import type { ProviderProtocol } from "./http-provider.client";

/**
 * "API de proveedores Viggo" v1 (docs/api-proveedores.md). Any provider implementing it is
 * set up with configuration only. Readers throw on anything outside the contract.
 */
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected an object");
  return value as Record<string, unknown>;
};
const text = (value: unknown) => {
  if (typeof value !== "string" || !value.trim() || value.length > 256) throw new Error("Expected text");
  return value;
};
const STATUSES = new Set(["payable", "paid", "expired"]);

export const standardProviderProtocol: ProviderProtocol = {
  quoteRequest: (qr, parkingId) => ({ path: "v1/quotes", body: { qr, parkingId } }),

  readQuote(body): ExternalQuote {
    const quote = record(body);
    const parking = record(quote.parking);
    const expiresAt = Date.parse(text(quote.expiresAt));
    if (!Number.isFinite(expiresAt)) throw new Error("Invalid expiresAt");
    if (!Number.isSafeInteger(quote.amountMinor)) throw new Error("Invalid amountMinor");
    if (!STATUSES.has(String(quote.status))) throw new Error("Invalid status");
    // Amount limits and currency are enforced by the payment service for every provider.
    return {
      reference: text(quote.reference),
      ticket: text(quote.ticket),
      parking: { id: text(parking.id), name: text(parking.name) },
      amountMinor: quote.amountMinor as number,
      currency: text(quote.currency),
      expiresAt,
      status: quote.status as ExternalQuote["status"],
    };
  },

  confirmationRequest: ({ reference, paymentReference, amountMinor, currency }) => ({
    path: "v1/confirmations",
    body: { reference, paymentReference, amountMinor, currency },
  }),

  readConfirmation: (body) => ({ confirmationReference: text(record(body).confirmationReference) }),
};
