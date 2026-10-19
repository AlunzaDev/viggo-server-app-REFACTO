/**
 * Reference implementation of docs/api-proveedores.md (API de proveedores Viggo v1).
 * A fake parking provider with in-memory test tickets: providers compare their responses
 * with it, and Viggo tests its generic client against it.
 *
 *   npm run provider:reference
 *   PROVIDER_PORT=4010 PROVIDER_TOKEN=referencia-viggo
 */
import express, { type Response } from "express";

const port = Number(process.env.PROVIDER_PORT ?? 4010);
const credential = process.env.PROVIDER_TOKEN ?? "referencia-viggo";
const QUOTE_TTL_MS = 10 * 60 * 1000;
const CONFIRM_GRACE_MS = 24 * 60 * 60 * 1000;

/** `amountMinor` grows with time in a real parking; fixed here. */
type TestTicket = { parkingId: string; parkingName: string; ticket: string; amountMinor: number; state: "open" | "paid" | "expired" };

/** Test tickets by QR, quotes by reference and confirmations by idempotency key. */
const createState = () => {
  const tickets = new Map<string, TestTicket>([
    ["PRV|000123|plaza-centro", { parkingId: "plaza-centro", parkingName: "Plaza Centro", ticket: "000123", amountMinor: 12550, state: "open" }],
    ["PRV|000124|plaza-centro", { parkingId: "plaza-centro", parkingName: "Plaza Centro", ticket: "000124", amountMinor: 8000, state: "paid" }],
    ["PRV|000125|plaza-centro", { parkingId: "plaza-centro", parkingName: "Plaza Centro", ticket: "000125", amountMinor: 5000, state: "expired" }],
  ]);
  const quotes = new Map<string, { qr: string; amountMinor: number; currency: string; expiresAt: number }>();
  const confirmations = new Map<string, { body: string; response: { confirmationReference: string } }>();
  return { tickets, quotes, confirmations };
};

const fail = (res: Response, status: number, code: string, message: string) => res.status(status).json({ error: { code, message } });
const text = (value: unknown, max = 256): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= max;

/** Each app has its own state, so tests do not affect one another. */
export const createProviderReferenceApp = () => {
  const { tickets, quotes, confirmations } = createState();
  const app = express();
  app.use(express.json({ limit: "16kb" }));

  app.use((req, res, next) => {
    if (req.header("Authorization") !== `Bearer ${credential}`) return fail(res, 401, "UNAUTHORIZED", "Credencial invalida");
    return next();
  });

  // Quotes have no side effects on the ticket.
  app.post("/v1/quotes", (req, res) => {
    const { qr, parkingId } = req.body ?? {};
    if (!text(qr, 4096) || !text(parkingId)) return fail(res, 400, "INVALID_REQUEST", "qr y parkingId son requeridos");
    const ticket = tickets.get(qr);
    if (!ticket || ticket.parkingId !== parkingId) return fail(res, 404, "TICKET_NOT_FOUND", "El QR no es un ticket de este estacionamiento");
    if (ticket.state === "expired") return fail(res, 410, "TICKET_EXPIRED", "El ticket ya no es valido");

    const reference = `TCK-${ticket.ticket}`;
    const expiresAt = Date.now() + QUOTE_TTL_MS;
    quotes.set(reference, { qr, amountMinor: ticket.amountMinor, currency: "MXN", expiresAt });
    return res.json({
      reference,
      ticket: ticket.ticket,
      parking: { id: ticket.parkingId, name: ticket.parkingName },
      amountMinor: ticket.amountMinor,
      currency: "MXN",
      expiresAt: new Date(expiresAt).toISOString(),
      status: ticket.state === "paid" ? "paid" : "payable",
    });
  });

  app.post("/v1/confirmations", (req, res) => {
    const key = String(req.header("Idempotency-Key") ?? "").trim();
    const { reference, paymentReference, amountMinor, currency } = req.body ?? {};
    if (!text(key) || !text(reference) || !text(paymentReference) || !Number.isSafeInteger(amountMinor) || currency !== "MXN") {
      return fail(res, 400, "INVALID_REQUEST", "Faltan datos de la confirmacion");
    }

    // Same key: same answer, never applied twice; different data: conflict.
    const body = JSON.stringify({ reference, paymentReference, amountMinor, currency });
    const previous = confirmations.get(key);
    if (previous) {
      if (previous.body !== body) return fail(res, 409, "IDEMPOTENCY_CONFLICT", "La llave ya se uso con otros datos");
      return res.json(previous.response);
    }

    const quote = quotes.get(reference);
    if (!quote || Date.now() > quote.expiresAt + CONFIRM_GRACE_MS) return fail(res, 410, "TICKET_EXPIRED", "La cotizacion ya no es valida");
    if (quote.amountMinor !== amountMinor || quote.currency !== currency) return fail(res, 409, "AMOUNT_MISMATCH", "El monto no es el cotizado");
    const ticket = tickets.get(quote.qr)!;
    if (ticket.state === "paid") return fail(res, 409, "TICKET_ALREADY_PAID", "El ticket ya estaba pagado");

    ticket.state = "paid";
    const response = { confirmationReference: `CONF-${ticket.ticket}-${confirmations.size + 1}` };
    confirmations.set(key, { body, response });
    return res.json(response);
  });

  app.use((_req, res) => fail(res, 404, "INVALID_REQUEST", "Ruta no definida en la API de proveedores v1"));
  return app;
};

if (require.main === module) {
  createProviderReferenceApp().listen(port, "127.0.0.1", () => {
    console.log(`Proveedor de referencia en http://127.0.0.1:${port} (credencial "${credential}")`);
  });
}
