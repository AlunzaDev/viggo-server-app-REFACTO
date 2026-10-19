import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createProviderReferenceApp } from "../../scripts/provider-reference-server";

// The reference provider must behave exactly as docs/api-proveedores.md describes.
let server: Server;
let base = "";

const call = async (path: string, body: unknown, headers: Record<string, string> = {}) => {
  const response = await fetch(base + path, {
    method: "POST",
    headers: { Authorization: "Bearer referencia-viggo", "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Record<string, any> };
};

const confirm = (key: string, body: Record<string, unknown>) =>
  call("/v1/confirmations", { currency: "MXN", paymentReference: "pi_prueba", ...body }, { "Idempotency-Key": key });

beforeAll(async () => {
  server = createProviderReferenceApp().listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe("API de proveedores Viggo v1: servidor de referencia", () => {
  it("requires the provider credential", async () => {
    const response = await call("/v1/quotes", { qr: "x", parkingId: "y" }, { Authorization: "Bearer otra" });
    expect(response).toMatchObject({ status: 401, body: { error: { code: "UNAUTHORIZED" } } });
  });

  it("quotes tickets with the documented shape and errors", async () => {
    const quote = await call("/v1/quotes", { qr: "PRV|000123|plaza-centro", parkingId: "plaza-centro" });
    expect(quote.status).toBe(200);
    expect(quote.body).toMatchObject({
      reference: "TCK-000123",
      ticket: "000123",
      parking: { id: "plaza-centro", name: "Plaza Centro" },
      amountMinor: 12550,
      currency: "MXN",
      status: "payable",
    });
    expect(Date.parse(quote.body.expiresAt)).toBeGreaterThan(Date.now());

    expect((await call("/v1/quotes", { qr: "PRV|000124|plaza-centro", parkingId: "plaza-centro" })).body.status).toBe("paid");
    expect((await call("/v1/quotes", { qr: "PRV|000125|plaza-centro", parkingId: "plaza-centro" })).body.error.code).toBe("TICKET_EXPIRED");
    expect((await call("/v1/quotes", { qr: "PRV|000123|plaza-centro", parkingId: "otro" })).body.error.code).toBe("TICKET_NOT_FOUND");
    expect((await call("/v1/quotes", { qr: "", parkingId: "plaza-centro" })).body.error.code).toBe("INVALID_REQUEST");
  });

  it("confirms idempotently and validates the quoted amount", async () => {
    await call("/v1/quotes", { qr: "PRV|000123|plaza-centro", parkingId: "plaza-centro" });

    const mismatch = await confirm("external-confirm:monto", { reference: "TCK-000123", amountMinor: 1 });
    expect(mismatch).toMatchObject({ status: 409, body: { error: { code: "AMOUNT_MISMATCH" } } });

    const first = await confirm("external-confirm:1", { reference: "TCK-000123", amountMinor: 12550 });
    expect(first.status).toBe(200);
    // A retry with the same key gets the same answer and is not applied twice.
    const retry = await confirm("external-confirm:1", { reference: "TCK-000123", amountMinor: 12550 });
    expect(retry.body.confirmationReference).toBe(first.body.confirmationReference);

    const conflict = await confirm("external-confirm:1", { reference: "TCK-000123", amountMinor: 12550, paymentReference: "pi_otro" });
    expect(conflict.body.error.code).toBe("IDEMPOTENCY_CONFLICT");
    // Another payment for the same, already paid ticket goes to review on Viggo's side.
    const again = await confirm("external-confirm:2", { reference: "TCK-000123", amountMinor: 12550 });
    expect(again).toMatchObject({ status: 409, body: { error: { code: "TICKET_ALREADY_PAID" } } });
  });
});
